/**
 * Jobインターフェース
 */
export default interface IJob {
  execute(): Promise<any>;
  cancel(): void;
}
