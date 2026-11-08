declare module "xlsx-populate/browser/xlsx-populate-no-encryption.min.js" {
  interface Cell {
    value(): unknown;
    value(value: unknown): Cell;
    formula(): string | undefined;
    style(value: Record<string, unknown>): Cell;
  }
  interface Sheet { cell(row: number, col: number): Cell }
  interface Workbook {
    sheet(name: string): Sheet | undefined;
    outputAsync(type: "blob"): Promise<Blob>;
  }
  const XlsxPopulate: { fromDataAsync(data: ArrayBuffer): Promise<Workbook> };
  export default XlsxPopulate;
}