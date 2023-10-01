import knex from "knex";

// ジョブの状態を更新するクラス
class JobState {
  // 環境変数の取得
  private static env = {
    job: {
      queueTableName: String(process.env.NODE_JOBQUEUE_TABLE_NAME),
      stateTableName: String(process.env.NODE_JOBSTATE_TABLE_NAME),
    },
    db: {
      host: String(process.env.DB_SERVER_HOST),
      port: Number(process.env.DB_SERVER_PORT),
      user: String(process.env.POSTGRES_USER),
      password: String(process.env.POSTGRES_PASSWORD),
      dbname: String(process.env.POSTGRES_DB),
    },
  };

  private static db = knex({
    client: "pg",
    connection: {
      database: JobState.env.db.dbname,
      host: JobState.env.db.host,
      port: JobState.env.db.port,
      user: JobState.env.db.user,
      password: JobState.env.db.password,
    },
    debug: false,
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 8,
    },
  });

  // ジョブステータス（ステータスの種別はAWSBatchに準拠）
  static State = {
    SUBMITTED: "SUBMITTED", // ジョブ実行予約
    RUNNING: "RUNNING", // ジョブ実行中
    SUCCEEDED: "SUCCEEDED", // ジョブ正常終了
    FAILED: "FAILED", // ジョブ実行失敗
  } as const;

  /**
   * ジョブステータス用のテーブル作成
   * @returns
   */
  static async createTable() {
    return JobState.db.schema
      .hasTable(JobState.env.job.stateTableName)
      .then((exists: boolean) => {
        // テーブルが存在しない場合は作成
        if (!exists) {
          console.log(
            `Create JobStatusTable '${JobState.env.job.stateTableName}'.`
          );
          return JobState.db.schema.createTable(
            JobState.env.job.stateTableName,
            (table) => {
              table.text("id");
              table.text("state");
              table.datetime("submit_datetime");
              table.datetime("update_datetime");
              table.text("result");
            }
          );
        } else {
          console.log(
            `JobStatusTable '${JobState.env.job.stateTableName}' already exists.`
          );
        }
      });
  }

  /**
   * ジョブを登録状態に設定する。
   * @param id ジョブID
   * @returns DB操作実行のPromise
   */
  static async setSubmit(id: string) {
    const now = JobState.db.fn.now();
    return JobState.db(JobState.env.job.stateTableName)
      .insert({
        id: id,
        state: JobState.State.SUBMITTED,
        submit_datetime: now,
        update_datetime: now,
      })
      .then(() => {});
  }

  /**
   * ジョブを実行状態に設定する。
   * @param id ジョブID
   * @returns DB操作実行のPromise
   */
  static async setRunning(id: string) {
    return JobState.db(JobState.env.job.stateTableName)
      .where("id", "=", id)
      .update({
        state: JobState.State.RUNNING,
        update_datetime: JobState.db.fn.now(),
      })
      .then(() => {});
  }

  /**
   * ジョブを成功状態に設定する。
   * @param id ジョブID
   * @param result 実行結果
   * @returns DB操作実行のPromise
   */
  static async setSuccess(id: string, result: string) {
    return JobState.db(JobState.env.job.stateTableName)
      .where("id", "=", id)
      .update({
        state: JobState.State.SUCCEEDED,
        result: result,
        update_datetime: JobState.db.fn.now(),
      })
      .then(() => {});
  }

  /**
   * ジョブを失敗状態に設定する。
   * @param id ジョブID
   * @param result 実行結果
   * @returns DB操作実行のPromise
   */
  static async setFailed(id: string, result: string) {
    return JobState.db(JobState.env.job.stateTableName)
      .where("id", "=", id)
      .update({
        state: JobState.State.FAILED,
        result: result,
        update_datetime: JobState.db.fn.now(),
      })
      .then(() => {});
  }

  /**
   * ジョブの状態を取得する。
   * @param id
   * @param callback
   * @returns DB操作実行のPromise
   */
  static async getState(id: string) {
    return JobState.db(JobState.env.job.stateTableName)
      .where("id", "=", id)
      .select("state")
      .then((rec) => {
        if (rec === undefined || rec.length === 0) {
          return null;
        }
        return rec[0].state;
      });
  }

  /**
   * キューイングされているタスクの数を取得する。
   * @param callback
   * @returns DB操作実行のPromise
   */
  static async getQueueingTaskNum() {
    return JobState.db(JobState.env.job.queueTableName)
      .count({ count: "*" })
      .then((rec) => {
        return Number(rec[0].count);
      });
  }
}

export default JobState;
