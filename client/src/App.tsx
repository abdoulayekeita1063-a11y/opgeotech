import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import SlopeStability from "./pages/SlopeStability";
import RockClassification from "./pages/RockClassification";
import Reporting from "./pages/Reporting";
import PostBlast from "./pages/PostBlast";
import DesignCompliance from "./pages/DesignCompliance";
import Archive from "./pages/Archive";
import Drillhole from "./pages/Drillhole";
import StructuralMapping from "./pages/StructuralMapping";
import KinematicAnalysis from "./pages/KinematicAnalysis";
import Monitoring from "./pages/Monitoring";
import WallRiskClassification from "./pages/WallRiskClassification";
import Download from "./pages/Download";

function LegacyRedirect({ to }: { to: string }) {
  useEffect(() => { window.location.replace(to); }, [to]);
  return null;
}

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/reporting"} component={Reporting} />
        <Route path={"/stability"} component={SlopeStability} />
        <Route path={"/classification"} component={RockClassification} />
        <Route path={"/inspections"} component={() => <LegacyRedirect to="/reporting#inspections" />} />
        <Route path={"/blast"} component={PostBlast} />
        <Route path={"/compliance"} component={DesignCompliance} />
        <Route path={"/drillhole"} component={Drillhole} />
        <Route path={"/mapping"} component={StructuralMapping} />
        <Route path={"/kinematics"} component={KinematicAnalysis} />
        <Route path={"/wall-risk-classification"} component={WallRiskClassification} />
        <Route path={"/monitoring"} component={Monitoring} />
        <Route path={"/radar-report"} component={() => <LegacyRedirect to="/monitoring#report" />} />
        <Route path={"/radar-failure-report"} component={() => <LegacyRedirect to="/monitoring#report" />} />
        <Route path={"/archive"} component={Archive} />
        <Route path={"/download"} component={Download} />
        <Route path={"/404"} component={NotFound} />
        {/* Final fallback route */}
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
