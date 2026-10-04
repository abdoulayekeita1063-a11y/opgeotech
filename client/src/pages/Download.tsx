import { ModuleHeader } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Download as DownloadIcon, Monitor, Smartphone, Globe } from "lucide-react";

const DOWNLOAD_URL = "/manus-storage/OPGeotech-Setup_77674499.exe?download=1";

export default function Download() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <ModuleHeader
        index=""
        title="Download OPGeotech"
        description="Install OPGeotech as a standalone desktop application on Windows, or add it to your home screen on mobile."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        {/* Windows Desktop */}
        <div className="border border-foreground p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Monitor className="h-8 w-8" />
            <div>
              <h2 className="font-bold text-lg uppercase">Windows Desktop</h2>
              <p className="text-xs text-muted-foreground">Windows 10/11 (64-bit)</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Download the standalone installer (.exe). Runs in its own window without a browser, with offline detection and automatic updates.
          </p>
          <a href={DOWNLOAD_URL} download="OPGeotech-Setup.exe">
            <Button className="w-full font-bold uppercase tracking-wider">
              <DownloadIcon className="h-4 w-4 mr-2" />
              Download for Windows (71 MB)
            </Button>
          </a>
          <p className="text-xs text-muted-foreground">
            Note: Windows SmartScreen may show a warning since the app is not code-signed. Click "More info" → "Run anyway" to proceed.
          </p>
        </div>

        {/* PWA / Mobile */}
        <div className="border border-foreground p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Smartphone className="h-8 w-8" />
            <div>
              <h2 className="font-bold text-lg uppercase">Mobile / Any Platform</h2>
              <p className="text-xs text-muted-foreground">Chrome, Edge, Safari</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Install as a Progressive Web App (PWA) directly from your browser — works on Windows, Mac, Linux, Android and iOS.
          </p>
          <div className="border border-dashed border-muted-foreground/40 p-4 text-sm space-y-2">
            <p className="font-medium">How to install:</p>
            <ul className="space-y-1 text-muted-foreground text-xs">
              <li><strong>Chrome/Edge (PC):</strong> Click the install icon in the address bar, or Menu → "Install OPGeotech"</li>
              <li><strong>Android (Chrome):</strong> Menu ⋮ → "Add to Home Screen" or "Install app"</li>
              <li><strong>iPhone/iPad (Safari):</strong> Share → "Add to Home Screen"</li>
            </ul>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="h-3.5 w-3.5" />
            <span>Or simply continue using the OPGeotech web application.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
