import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import jobRouter from "./job.mjs";
const app: Application = express();
const PORT = process.env.NODE_API_SERVER_PORT;
// リクエストボディのパース用設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// CORS設定
app.use(cors());
// GET
app.use("/api/job", jobRouter);
app.get("/api", async (_req: Request, res: Response, _next: NextFunction) => {
  return res.status(200).send({
    message: "Hello World!",
  });
});
// Error 404 Not Found
app.use((_req: Request, res: Response, _next: NextFunction) => {
  return res.status(404).json({ error: "Not Found" });
});
// サーバーを起動する処理
try {
  app.listen(PORT, () => {
    console.log("server running at port:" + PORT);
  });
} catch (e) {
  if (e instanceof Error) {
    console.error(e.message);
  }
}
