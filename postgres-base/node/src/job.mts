import express, { Request, Response, NextFunction } from "express";
import Queue from "better-queue";
import { scheduleJob } from "node-schedule";
import { randomUUID } from "crypto";
import JobState from "./jobState.mjs";

// 環境変数の取得
const env = {
  job: {
    timeout: Number(process.env.NODE_JOB_TIMEOUT) * 1000,
    concurrent: Number(process.env.NODE_JOB_CONCURRENT),
    maxQueueingSize: Number(process.env.NODE_JOB_MAX_QUEUEING_SIZE),
    jobStateRetentionPeriod: Number(process.env.NODE_JOBSTATE_RETENTION_PERIOD),
  },
  db: {
    host: String(process.env.DB_SERVER_HOST),
    port: Number(process.env.DB_SERVER_PORT),
    user: String(process.env.POSTGRES_USER),
    password: String(process.env.POSTGRES_PASSWORD),
    dbname: String(process.env.POSTGRES_DB),
  },
};

// 実行中ジョブのキャンセルコールバックを保持する連想配列
const jobCancelFuncs: { [key: string]: () => void } = {};

// ジョブステータステーブルの初期作成処理
JobState.createTable();

// 古いジョブステータスの削除(CRONで毎時0分0秒に実行)
const cron = scheduleJob("0 0 * * * *", async () => {
  console.log("[INFO] CRON: Delete old job state");
  await JobState.deleteOldState(env.job.jobStateRetentionPeriod);
});

// ジョブ処理用のキュー
const jobQueue = new Queue(
  async (
    input: { id: string; jobName: string; param: any },
    callback: Queue.ProcessFunctionCb<any>
  ) => {
    try {
      // idとjob名とPOSTされたデータを取り出す
      const { id, jobName, param } = input;

      // ジョブ名のjavascriptをnodeで実行する。
      let jobModule = null;
      try {
        jobModule = await import(`./jobfiles/${jobName}.mjs`);
      } catch (e: any) {
        callback(e.stack);
      }

      // ジョブ状態をRUNNINGに変更
      await JobState.setRunning(id);

      // ジョブを実行しキャンセル用のコールバックを保存
      const canncelCallback = jobModule.job(id, param, callback);
      jobCancelFuncs[id] = canncelCallback;
    } catch (e: any) {
      // エラー時：エラーコールバック実行
      callback(e.stack);
    }
  },
  {
    // 優先度設定のメソッド
    priority: (input, callback) => {
      // jobリクエスト時の優先度を設定
      callback(null, input.param.priority);
    },

    // 同時実行可能数
    concurrent: env.job.concurrent,

    // タイムアウト設定
    maxTimeout: env.job.timeout,

    // キュー保存先
    store: {
      type: "sql",
      dialect: "postgres",
      host: env.db.host,
      port: env.db.port,
      username: env.db.user,
      password: env.db.password,
      dbname: env.db.dbname,
      tableName: "jobqueue",
    },
  }
);

// ジョブ完了時の処理
jobQueue.on("task_finish", (id: string, result: object, stats: object) => {
  console.log("Job has finished with " + result.toString());
  // ジョブステータスをSUCCESSに変更
  JobState.setSuccess(id, result.toString());
  // キャンセルを解放
  delete jobCancelFuncs[id];
});

// ジョブ失敗時の処理
jobQueue.on("task_failed", (id: string, result: object, stats: object) => {
  console.log("Job has failed with " + result.toString());
  // ジョブステータスをFAILEDに変更
  JobState.setFailed(id, result.toString());
  // タイムアウト、キャンセルの場合はキャンセル処理を実行
  if (
    typeof result === "string" &&
    (result === "task_timeout" || result === "cancelled")
  ) {
    jobCancelFuncs[id]();
  }
  // キャンセルを解放
  delete jobCancelFuncs[id];
});

// ジョブIDに半角英数字以外が含まれているかのチェッカー（不正コマンドの実行防止）
const jobIDChecker = new RegExp("[a-zA-Z0-9]+_[a-zA-Z0-9]+");
// ジョブ名に英数字以外が含まれているかのチェッカー（不正コマンドの実行防止）
const jobNameChecker = new RegExp("^[a-zA-Z0-9]+$");
// ジョブAPIのルーター
const jobRouter = express.Router();

// ジョブの実行
jobRouter.post(
  "/run/:jobName",
  async (req: Request, res: Response, _next: NextFunction) => {
    // URLパラメータからジョブ名を取得
    const jobName = req.params.jobName;
    // リクエストボディからジョブの実行パラメータを取得
    const data = req.body;

    // ジョブ名に英数字以外が含まれている場合はエラー（不正コマンドの実行防止）
    if (!jobNameChecker.test(jobName)) {
      return res.status(404).json({
        error: "job not found",
      });
    }

    // ジョブ名のモジュールを読み込む
    let jobModule = null;
    try {
      jobModule = await import(`./jobfiles/${jobName}.mjs`);
    } catch (e) {
      // ジョブ名のモジュールが存在しない場合
      console.error(e);
      return res.status(404).json({
        error: "job not found",
      });
    }

    // ジョブ定義のパラメータチェック
    try {
      // パラメータチェックでエラーがある場合はエラーレスポンス
      const errors = jobModule.checkParam(req.body);
      if (errors.length > 0) {
        return res.status(400).json({
          error: "parameter error",
          details: errors,
        });
      }
    } catch (e) {
      // パラメータチェック中に例外が発生した場合
      return res.status(500).json({
        error: "request parameter check error",
      });
    }

    // キューイング数チェック
    const count = await JobState.getQueueingTaskNum();
    if (count >= env.job.maxQueueingSize) {
      return res.status(429).json({
        error: "Too many requests",
      });
    }

    // ジョブIDの生成（ジョブ名_uuid）
    const id = jobName + "_" + randomUUID();

    // キューへ登録するデータを作成
    const queueInput = {
      id: id, // ジョブID
      jobName: jobName, // 実行するジョブ名称
      param: data, // POSTされたデータ
    };

    // ジョブステータスをSUBMITTEDで登録
    await JobState.setSubmit(id);

    // ジョブをキューに登録
    jobQueue.push(queueInput);

    // レスポンス：ジョブIDを返却
    console.log(`Submit JobName: ${jobName} JobID: ${id}`);
    return res.status(200).json({ id: id });
  }
);

// ジョブステータスの取得API
jobRouter.get(
  "/status",
  async (req: Request, res: Response, _next: NextFunction) => {
    // ジョブIDが指定されていない場合
    const id = req.query.id?.toString();
    if (id === undefined) {
      res.status(400).json({
        error: "job id is not specified",
      });
      return;
    }

    // ジョブIDに半角英数以外が含まれている場合はエラー（不正コマンドの実行防止）
    if (!jobIDChecker.test(id)) {
      res.status(404).json({
        error: "job not found",
      });
      return;
    }

    // ジョブステータスを取得
    const state = await JobState.getState(id);

    // 指定されたジョブIDと一致するジョブがない場合
    if (state === null) {
      return res.status(404).json({
        error: "job not found",
      });
    }

    // レスポンス：ジョブステータスを返す
    const response = {
      id: id,
      state: state,
    };
    console.log(`Job Status: ${JSON.stringify(response)}`);
    return res.status(200).json(response);
  }
);

// ジョブの実行キャンセルAPI
jobRouter.post(
  "/cancel",
  async (req: Request, res: Response, _next: NextFunction) => {
    // ジョブIDが指定されていない場合
    const id = req.body.id;
    if (id === undefined) {
      return res.status(400).json({
        error: "job id is not specified",
      });
    }

    // ジョブステータスを取得
    const state = await JobState.getState(id);

    // 指定されたジョブIDと一致するジョブがない場合
    if (state === null) {
      return res.status(404).json({
        error: "job not found",
      });
    }

    // 既にジョブが終了済みの場合
    if (state === JobState.State.SUCCEEDED || state === JobState.State.FAILED) {
      return res.status(400).json({
        error: "job not found",
      });
    }

    // ジョブが終わっていなければキャンセル
    jobQueue.cancel(id);
    console.log(`Cancel JobID: ${id}`);
    return res.status(200).json("OK");
  }
);

export default jobRouter;
