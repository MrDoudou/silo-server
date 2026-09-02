import { tr } from "@/i18n/translate";
export const USER_DATABASE_BACKEND_OPTIONS = [
  {
    value: "postgres",
    get label() {
      return tr("pages.admin_settings.database_setting_options.postgre_sql");
    },
  },
  {
    value: "sqlite",
    get label() {
      return tr("pages.admin_settings.database_setting_options.sqlite_tbd");
    },
    disabled: true,
  },
];
