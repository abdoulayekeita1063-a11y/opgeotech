import { useEffect, useState, type ReactNode } from "react";
import { ModuleHeader } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Download as DownloadIcon,
  Monitor,
  Smartphone,
  WifiOff,
} from "lucide-react";

type ReleaseAsset = {
  fileName: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  signed: boolean;
  downloadUrl: string | null;
};

type ReleaseMetadata = {
  product: string;
  version: string;
  published: boolean;
  windows: ReleaseAsset;
  android: ReleaseAsset;
};

const FALLBACK_RELEASE: ReleaseMetadata = {
  product: "OPGeotech",
  version: "v1.0.0",
  published: true,
  windows: {
    fileName: "OPGeotech-Desktop-Setup-1.0.0.exe",
    sizeBytes: null,
    sha256: null,
    signed: false,
    downloadUrl:
      "https://github.com/abdoulayekeita1063-a11y/opgeotech/releases/download/v1.0.0/OPGeotech-Desktop-Setup-1.0.0.exe",
  },
  android: {
    fileName: null,
    sizeBytes: null,
    sha256: null,
    signed: false,
    downloadUrl: null,
  },
};

function formatSize(sizeBytes: number | null) {
  if (!sizeBytes) return "Available after build";
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function PackageCard({
  platform,
  title,
  description,
  icon,
  asset,
}: {
  platform: "Windows" | "Android";
  title: string;
  description: string;
  icon: ReactNode;
  asset: ReleaseAsset;
}) {
  const available = Boolean(asset.downloadUrl);

  return (
    <div className="flex h-full flex-col justify-between border border-foreground bg-white p-6">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-red-600">{icon}</span>
            <div>
              <h2 className="text-xl font-black uppercase">{title}</h2>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {platform} installer
              </p>
            </div>
          </div>
          <span
            className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${available ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-amber-400 bg-amber-50 text-amber-800"}`}
          >
            {available ? "Ready" : "In preparation"}
          </span>
        </div>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-px border border-slate-200 bg-slate-200 text-xs">
          <div className="bg-slate-50 p-3">
            <p className="uppercase tracking-wider text-muted-foreground">
              File
            </p>
            <p className="mt-1 break-all font-bold text-foreground">
              {asset.fileName ?? "Not published yet"}
            </p>
          </div>
          <div className="bg-slate-50 p-3">
            <p className="uppercase tracking-wider text-muted-foreground">
              Size
            </p>
            <p className="mt-1 font-bold text-foreground">
              {formatSize(asset.sizeBytes)}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-6">
        {available ? (
          <a
            href={asset.downloadUrl ?? undefined}
            download={asset.fileName ?? undefined}
          >
            <Button className="w-full font-bold uppercase tracking-wider">
              <DownloadIcon className="mr-2 h-4 w-4" />
              Download {platform} installer
            </Button>
          </a>
        ) : (
          <Button
            disabled
            className="w-full font-bold uppercase tracking-wider"
          >
            <DownloadIcon className="mr-2 h-4 w-4" />
            Download {platform} installer
          </Button>
        )}
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {available
            ? asset.signed
              ? "Signed package ready for installation."
              : "Test package ready. Your device may show a publisher warning."
            : "This package will become available after the build is published."}
        </p>
      </div>
    </div>
  );
}

export default function Download() {
  const [release, setRelease] = useState<ReleaseMetadata>(FALLBACK_RELEASE);

  useEffect(() => {
    const loadRelease = async () => {
      try {
        const localResponse = await fetch("/opgeotech-release.json", {
          cache: "no-store",
        });
        if (localResponse.ok) {
          const local = (await localResponse.json()) as ReleaseMetadata;
          if (local?.windows && local?.android) setRelease(local);
        }
      } catch {
        // GitHub release lookup below remains available as a fallback.
      }

      try {
        const response = await fetch(
          "https://api.github.com/repos/abdoulayekeita1063-a11y/opgeotech/releases/latest",
          {
            headers: { Accept: "application/vnd.github+json" },
            cache: "no-store",
          }
        );
        if (!response.ok) return;
        const latest = await response.json();
        const assets = Array.isArray(latest.assets) ? latest.assets : [];
        const find = (extension: "exe" | "apk") =>
          assets.find((asset: { name?: string }) =>
            asset.name?.toLowerCase().endsWith(`.${extension}`)
          );
        const exe = find("exe");
        const apk = find("apk");
        if (!exe || !apk) return;
        setRelease({
          product: "OPGeotech",
          version: latest.tag_name ?? "v1.0.0",
          published: true,
          windows: {
            fileName: exe.name ?? null,
            sizeBytes: exe.size ?? null,
            sha256: null,
            signed: false,
            downloadUrl: exe.browser_download_url ?? null,
          },
          android: {
            fileName: apk.name ?? null,
            sizeBytes: apk.size ?? null,
            sha256: null,
            signed: true,
            downloadUrl: apk.browser_download_url ?? null,
          },
        });
      } catch {
        // Keep the local release metadata when GitHub is unavailable.
      }
    };

    void loadRelease();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <ModuleHeader
        index=""
        title="Download OPGeotech"
        module="Windows and Android"
        description="Download the installable OPGeotech application for Windows or Android."
      />

      <section className="mt-8 border border-red-200 bg-red-50/60 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
          <div className="space-y-1 text-sm text-red-900">
            <p className="font-bold">Choose your device</p>
            <p className="leading-6">
              Download the correct installer, transfer it to the target device
              if needed, then follow the normal installation prompts. No MSI or
              ZIP package is required.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <PackageCard
          platform="Windows"
          title="OPGeotech Windows"
          icon={<Monitor className="h-8 w-8" />}
          asset={release.windows}
          description="Install OPGeotech on Windows 10 or Windows 11. The installer creates the OPGeotech application shortcut and supports the project workspace synchronization tools."
        />
        <PackageCard
          platform="Android"
          title="OPGeotech Android"
          icon={<Smartphone className="h-8 w-8" />}
          asset={release.android}
          description="Install the Android application on a compatible Android phone or tablet. Enable installation from this source when Android asks for permission."
        />
      </section>

      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="border border-foreground bg-white p-6">
          <h2 className="text-lg font-bold uppercase">Windows installation</h2>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            <li>
              <strong className="text-foreground">1.</strong> Download the EXE
              file.
            </li>
            <li>
              <strong className="text-foreground">2.</strong> Open it and follow
              the installation prompts.
            </li>
            <li>
              <strong className="text-foreground">3.</strong> Launch OPGeotech
              from the Start menu or desktop shortcut.
            </li>
          </ol>
        </div>
        <div className="border border-foreground bg-white p-6">
          <h2 className="text-lg font-bold uppercase">Android installation</h2>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            <li>
              <strong className="text-foreground">1.</strong> Download the APK
              on the Android device.
            </li>
            <li>
              <strong className="text-foreground">2.</strong> Open the APK and
              allow installation from this source if requested.
            </li>
            <li>
              <strong className="text-foreground">3.</strong> Tap Install, then
              open OPGeotech from the Android launcher.
            </li>
          </ol>
        </div>
      </section>

      <section className="mt-6 flex items-start gap-3 border border-dashed border-muted-foreground/60 p-6 text-sm leading-6 text-muted-foreground">
        <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <p>
          <strong className="text-foreground">Offline behavior:</strong> the
          installed application can reopen cached screens when the network is
          temporarily unavailable. Cloud data synchronization still requires an
          internet connection.
        </p>
      </section>
    </div>
  );
}
