import "i18next";

import { defaultNamespace, englishResources } from "@/i18n/resources";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNamespace;
    resources: typeof englishResources;
    returnNull: false;
  }
}
