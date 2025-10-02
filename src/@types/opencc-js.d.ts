declare module 'opencc-js' {
  export type Converter = (input: string) => string;

  export interface ConverterOptions {
    from: string;
    to: string;
  }

  export function Converter(options: ConverterOptions): Converter;
  export function CustomConverter(mapping: ReadonlyArray<[string, string]> | string): Converter;
  export const Locale: Record<string, unknown>;
  export function HTMLConverter(
    converter: Converter,
    rootNode: ParentNode,
    langAttrInitial: string,
    langAttrNew: string,
  ): { convert: () => void; restore: () => void };
}
