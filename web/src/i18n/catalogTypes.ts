export type TranslationCatalog = {
  readonly [key: string]: string | TranslationCatalog;
};

export type PartialTranslationCatalog<T> = {
  readonly [Key in keyof T]?: T[Key] extends string
    ? string
    : T[Key] extends TranslationCatalog
      ? PartialTranslationCatalog<T[Key]>
      : never;
};
