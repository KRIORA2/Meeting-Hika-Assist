declare module "pdf-parse" {
  type PdfParseResult = {
    text: string;
    numpages?: number;
    numrender?: number;
    info?: unknown;
    metadata?: unknown;
    version?: string;
  };

  function pdfParse(dataBuffer: Buffer | Uint8Array, options?: unknown): Promise<PdfParseResult>;

  export default pdfParse;
}
