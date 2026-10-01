export type Message = string | ({ other: string } & Partial<Record<Intl.LDMLPluralRule, string>>);
export type Values = Record<string, string | number>;
