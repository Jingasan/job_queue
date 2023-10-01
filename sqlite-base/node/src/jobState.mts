import knex from "knex";
import * as DateFns from "date-fns";

// ジョブの状態を更新するクラス
class JobState {
  // テーブル設定
  private static job = {
    queueTableName: "tasks", // ジョブキュー用テーブル
    stateTableName: "jobstate", // ジョブ状態用管理テーブル
  };

  // DB接続設定
  private static db = knex({
    client: "sqlite3",
    connection: {
      filename: "db/sqlite.db",
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
   * @returns true:正常終了/false:エラー
   */
  static async createTable(): Promise<boolean> {
    return JobState.db.schema
      .hasTable(JobState.job.stateTableName)
      .then(async (exists: boolean): Promise<boolean> => {
        // テーブルが存在しない場合は作成
        if (!exists) {
          console.log(
            `Create JobStatusTable '${JobState.job.stateTableName}'.`
          );
          return JobState.db.schema
            .createTable(JobState.job.stateTableName, (table: any) => {
              table.text("id");
              table.text("state");
              table.datetime("submit_datetime");
              table.datetime("update_datetime");
              table.text("result");
            })
            .then(() => {
              return true;
            })
            .catch((e) => {
              return false;
            });
        } else {
          console.log(
            `JobStatusTable '${JobState.job.stateTableName}' already exists.`
          );
          return true;
        }
      })
      .catch((e) => {
        console.error(e);
        return false;
      });
  }

  /**
   * ジョブを登録状態に設定する。
   * @param id ジョブID
   * @returns true:正常終了/false:エラー
   */
  static async setSubmit(id: string): Promise<boolean> {
    const now = new Date().toISOString();
    return JobState.db(JobState.job.stateTableName)
      .insert({
        id: id,
        state: JobState.State.SUBMITTED,
        submit_datetime: now,
        update_datetime: now,
      })
      .then(() => {
        return true;
      })
      .catch((e) => {
        console.error(e);
        return false;
      });
  }

  /**
   * ジョブを実行状態に設定する。
   * @param id ジョブID
   * @returns true:正常終了/false:エラー
   */
  static async setRunning(id: string): Promise<boolean> {
    return JobState.db(JobState.job.stateTableName)
      .where("id", "=", id)
      .update({
        state: JobState.State.RUNNING,
        update_datetime: new Date().toISOString(),
      })
      .then(() => {
        return true;
      })
      .catch((e) => {
        console.error(e);
        return false;
      });
  }

  /**
   * ジョブを成功状態に設定する。
   * @param id ジョブID
   * @param result 実行結果
   * @returns true:正常終了/false:エラー
   */
  static async setSuccess(id: string, result: string): Promise<boolean> {
    return JobState.db(JobState.job.stateTableName)
      .where("id", "=", id)
      .update({
        state: JobState.State.SUCCEEDED,
        result: result,
        update_datetime: new Date().toISOString(),
      })
      .then(() => {
        return true;
      })
      .catch((e) => {
        console.error(e);
        return false;
      });
  }

  /**
   * ジョブを失敗状態に設定する。
   * @param id ジョブID
   * @param result 実行結果
   * @returns true:正常終了/false:エラー
   */
  static async setFailed(id: string, result: string): Promise<boolean> {
    return JobState.db(JobState.job.stateTableName)
      .where("id", "=", id)
      .update({
        state: JobState.State.FAILED,
        result: result,
        update_datetime: new Date().toISOString(),
      })
      .then(() => {
        return true;
      })
      .catch((e) => {
        console.error(e);
        return false;
      });
  }

  /**
   * ジョブの状態を取得する。
   * @param id
   * @returns ジョブ状態
   */
  static async getState(id: string): Promise<any> {
    return JobState.db(JobState.job.stateTableName)
      .where("id", "=", id)
      .select("state")
      .then((rec) => {
        if (rec === undefined || rec.length === 0) {
          return null;
        }
        return rec[0].state;
      })
      .catch((e) => {
        console.error(e);
        return false;
      });
  }

  /**
   * ジョブの状態を削除する
   * @param retentionPeriod
   * @returns true:正常終了/false:エラー
   */
  static async deleteOldState(retentionPeriodDay: number): Promise<boolean> {
    return JobState.db(JobState.job.stateTableName)
      .where(
        "update_datetime",
        "<=",
        DateFns.subDays(Date.now(), retentionPeriodDay).toISOString()
      )
      .del()
      .then(() => {
        return true;
      })
      .catch((e) => {
        console.error(e);
        return false;
      });
  }

  /**
   * キューイングされているジョブ数を取得する。
   * @returns キューイングジョブ数
   */
  static async getQueueingTaskNum(): Promise<number> {
    return JobState.db(JobState.job.queueTableName)
      .count({ count: "*" })
      .then((rec) => {
        return Number(rec[0].count);
      })
      .catch((e) => {
        console.error(e);
        return 0;
      });
  }
}

export default JobState;
