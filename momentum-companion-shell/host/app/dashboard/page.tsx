import { Suspense } from "react";
import DashboardPage from "./dashboardPage";

export default function DashboardRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-brand-bg">
          Loading dashboard...
        </div>
      }
    >
      <DashboardPage />
    </Suspense>
  );
}
