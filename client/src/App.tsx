import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import SlopeStability from "./pages/SlopeStability";
import RockClassification from "./pages/RockClassification";
import DailyInspections from "./pages/DailyInspections";
import PostBlast from "./pages/PostBlast";
import DesignCompliance from "./pages/DesignCompliance";
import Archive from "./pages/Archive";
import Drillhole from "./pages/Drillhole";
import StructuralMapping from "./pages/StructuralMapping";
import KinematicAnalysis from "./pages/KinematicAnalysis";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/stability"} component={SlopeStability} />
        <Route path={"/classification"} component={RockClassification} />
        <Route path={"/inspections"} component={DailyInspections} />
        <Route path={"/blast"} component={PostBlast} />
        <Route path={"/compliance"} component={DesignCompliance} />
        <Route path={"/drillhole"} component={Drillhole} />
        <Route path={"/mapping"} component={StructuralMapping} />
        <Route path={"/kinematics"} component={KinematicAnalysis} />
        <Route path={"/archive"} component={Archive} />
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
