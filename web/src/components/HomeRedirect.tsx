import { Link, Navigate } from "react-router";
import { useUserLibraries } from "@/hooks/queries/libraries";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export default function HomeRedirect() {
  useUILanguage();
  const { data: libraries, isLoading } = useUserLibraries();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
      </div>
    );
  }

  const firstLibrary = libraries?.[0];
  if (firstLibrary) {
    return <Navigate to={"/library/" + firstLibrary.id} replace />;
  }

  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p>{tr("components.home_redirect.no_visible_libraries_are_available_right_now")}</p>
      <Link to="/settings/libraries" className="text-primary text-sm font-medium hover:underline">
        {tr("components.home_redirect.manage_library_visibility_in_settings")}
      </Link>
    </div>
  );
}
