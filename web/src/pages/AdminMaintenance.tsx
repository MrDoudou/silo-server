import AdminCatalogMaintenance from "@/components/AdminCatalogMaintenance";
import AdminJobHistory from "@/components/AdminJobHistory";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export default function AdminMaintenance() {
  useUILanguage();
  return (
    <div className="page-shell space-y-6 py-4 sm:py-6">
      <div className="page-header gap-5">
        <div className="space-y-3">
          <h1 className="page-title text-[clamp(2rem,4vw,3rem)]">
            {tr("pages.admin_maintenance.maintenance")}
          </h1>
          <p className="page-subtitle text-sm sm:text-base">
            {tr(
              "pages.admin_maintenance.operational_tools_that_affect_the_whole_catalog_live_here_use",
            )}
          </p>
        </div>
      </div>

      <AdminCatalogMaintenance />
      <AdminJobHistory />
    </div>
  );
}
