import DockerJobDefinition from "./lib/DockerJob.mjs";

/**
 * ジョブ実行
 * @param id ジョブID
 * @param param ジョブパラメータ
 * @param callback コールバック関数
 * @returns
 */
export const job = (id: string, param: any, callback: any) => {
  // ジョブ１の定義
  const job1 = new DockerJobDefinition({
    name: id + "_1",
    image: "nginx",
    cpu: 1,
    memory: 256,
    // Dockerコンテナで実行するコマンドを配列形式で記載
    cmd: ["sleep", param.sleep],
  });
  // ジョブ２の定義
  const job2 = new DockerJobDefinition({
    name: id + "_2",
    image: "nginx",
    cpu: 1,
    memory: 256,
    // Dockerコンテナで実行するコマンドを配列形式で記載
    cmd: ["sleep", param.sleep],
  });
  // ジョブ３の定義
  const job3 = new DockerJobDefinition({
    name: id + "_3",
    image: "nginx",
    cpu: 1,
    memory: 256,
    // Dockerコンテナで実行するコマンドを配列形式で記載
    cmd: ["sleep", param.sleep],
  });
  // ジョブ４の定義
  const job4 = new DockerJobDefinition({
    name: id + "_4",
    image: "nginx",
    cpu: 1,
    memory: 256,
    // Dockerコンテナで実行するコマンドを配列形式で記載
    cmd: ["sleep", param.sleep],
  });

  // タイムアウトするか
  let isTimeout = false;

  // ジョブ実行（初めにジョブ１を実行）
  job1
    .execute()
    .then((code) => {
      if (isTimeout) {
        return Promise.reject("TIMEOUT");
      }
      // ジョブ１正常終了後、ジョブ２と３を実行
      return Promise.all([job2.execute(), job3.execute()]);
    })
    .then((code) => {
      if (isTimeout) {
        return Promise.reject("TIMEOUT");
      }
      // ジョブ２と３正常終了後、ジョブ４を実行
      return job4.execute();
    })
    .then((code) => {
      if (isTimeout) {
        return Promise.reject("TIMEOUT");
      }
      // ジョブ４正常終了後、BetterQueueの完了コールバックを実行
      callback(false, "SUCCESS");
    })
    .catch((reason) => {
      console.error(reason);
      // エラーがあった場合終了
      callback(reason);
    });

  // キャンセルする場合のコールバックを戻り値とする
  return () => {
    //isTimeout = true;
    job1.cancel();
    job2.cancel();
    job3.cancel();
    job4.cancel();
  };
};

/**
 * APIのパラメータチェック
 * OSコマンドインジェクションを防ぐためのチェックを行う。
 * ここでパラメータの型の整合性やホワイトリスト形式での入力チェックをしてもらう想定。
 * https://www.ipa.go.jp/security/vuln/websecurity/os-command.html#:~:text=2%2D(ii)%20%E3%82%B7%E3%82%A7%E3%83%AB%E3%82%92%E8%B5%B7%E5%8B%95%E3%81%A7%E3%81%8D%E3%82%8B%E8%A8%80%E8%AA%9E%E6%A9%9F%E8%83%BD%E3%82%92%E5%88%A9%E7%94%A8%E3%81%99%E3%82%8B%E5%A0%B4%E5%90%88%E3%81%AF%E3%80%81%E3%81%9D%E3%81%AE%E5%BC%95%E6%95%B0%E3%82%92%E6%A7%8B%E6%88%90%E3%81%99%E3%82%8B%E5%85%A8%E3%81%A6%E3%81%AE%E5%A4%89%E6%95%B0%E3%81%AB%E5%AF%BE%E3%81%97%E3%81%A6%E3%83%81%E3%82%A7%E3%83%83%E3%82%AF%E3%82%92%E8%A1%8C%E3%81%84%E3%80%81%E3%81%82%E3%82%89%E3%81%8B%E3%81%98%E3%82%81%E8%A8%B1%E5%8F%AF%E3%81%97%E3%81%9F%E5%87%A6%E7%90%86%E3%81%AE%E3%81%BF%E3%82%92%E5%AE%9F%E8%A1%8C%E3%81%99%E3%82%8B%E3%80%82
 * 自由な文字は書かせないことをルール化。
 * @param param
 * @returns
 */
export const checkParam = (param: any) => {
  const errors: Array<string> = [];
  // パラメータにsleepが含まれるかチェック
  if (param.sleep === undefined) {
    errors.push("No parameter: sleep");
  } else {
    // sleep値が数値かチェック
    if (typeof param.sleep !== "number") {
      errors.push("Parameter 'sleep' is not number.");
    }
    // sleep値が1-1000の値であるかチェック
    const sleep = Number(param.sleep);
    if (sleep > 1000 || sleep <= 0) {
      errors.push(`Parameter 'sleep' ${sleep} must be 1-1000.`);
    }
  }
  return errors;
};
