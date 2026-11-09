import { useEffect, useState } from "react";
import { ModuleHeader } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Download as DownloadIcon,
  Monitor,
  Smartphone,
  WifiOff,
} from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function Download() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  };

  const openApp = () => {
    window.location.assign("/");
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <ModuleHeader
        index=""
        title="Install OPGeotech"
        module="Application"
        description="Use OPGeotech as an application from your browser, without downloading EXE, MSI or ZIP files."
      />

      <section className="mt-8 border border-foreground bg-white p-8 text-center md:p-12">
        <div className="mx-auto flex h-16 w-16 items-center justify-center bg-red-50">
          <DownloadIcon className="h-8 w-8 text-red-600" />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-red-600">
          One installation mode
        </p>
        <h1 className="mt-3 text-3xl font-black uppercase tracking-tight md:text-5xl">
          Install OPGeotech as an application
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
          Add OPGeotech to your Windows, Mac, Android or iPhone device directly
          from the browser. It opens in its own application window and keeps the
          OPGeotech workspace easy to access.
        </p>

        <div className="mt-8 flex justify-center">
          {installed ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="flex items-center gap-2 border border-emerald-400 bg-emerald-50 px-5 py-3 font-bold text-emerald-800">
                <CheckCircle2 className="h-5 w-5" />
                OPGeotech is already installed
              </div>
              <Button
                onClick={openApp}
                className="h-12 px-8 font-bold uppercase tracking-wider"
              >
                Open OPGeotech app
              </Button>
            </div>
          ) : installPrompt ? (
            <Button
              onClick={() => void installApp()}
              className="h-12 px-8 font-bold uppercase tracking-wider"
            >
              <DownloadIcon className="mr-2 h-5 w-5" />
              Install OPGeotech
            </Button>
          ) : (
            <div className="border border-amber-400 bg-amber-50 px-5 py-3 text-left text-sm text-amber-900">
              Use your browser menu and choose{" "}
              <strong>Install OPGeotech</strong>
              or <strong>Add to Home screen</strong>.
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 grid gap-6 md:grid-cols-3">
        <div className="border border-foreground bg-white p-6">
          <Monitor className="h-7 w-7 text-red-600" />
          <h2 className="mt-5 text-lg font-bold uppercase">Windows and Mac</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Open the browser menu, select the install icon or choose
            <strong className="text-foreground"> Install OPGeotech</strong>.
          </p>
        </div>
        <div className="border border-foreground bg-white p-6">
          <Smartphone className="h-7 w-7 text-red-600" />
          <h2 className="mt-5 text-lg font-bold uppercase">
            Android and iPhone
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Use <strong className="text-foreground">Add to Home screen</strong>
            from the browser sharing or options menu.
          </p>
        </div>
        <div className="border border-foreground bg-white p-6">
          <WifiOff className="h-7 w-7 text-red-600" />
          <h2 className="mt-5 text-lg font-bold uppercase">Offline-ready</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The installed application can reopen its cached workspace when the
            network is temporarily unavailable.
          </p>
        </div>
      </section>

      <section className="mt-6 border border-dashed border-muted-foreground/60 p-6 text-sm leading-6 text-muted-foreground">
        <strong className="text-foreground">
          No other download is required.
        </strong>{" "}
        OPGeotech is installed from the application page itself. Your account,
        team workspace and project data remain connected to the same OPGeotech
        application.
      </section>
    </div>
  );
}
