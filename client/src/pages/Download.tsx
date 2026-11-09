import { useEffect, useState } from "react";
import { ModuleHeader } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download as DownloadIcon,
  FileArchive,
  FolderOpen,
  KeyRound,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

const SOURCE_PACKAGE_URL =
  "/manus-storage/OPGeotech-Desktop-Installer-Sources-v2_f30bf001.zip";

type InstallerArtifact = {
  fileName: string;
  size: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  signed: boolean;
  downloadUrl: string | null;
};

type DesktopRelease = {
  product: string;
  version: string;
  published: boolean;
  architecture: string;
  releaseUrl?: string | null;
  artifacts: {
    exe: InstallerArtifact;
    msi: InstallerArtifact;
  };
};

const FALLBACK_RELEASE: DesktopRelease = {
  product: "OPGeotech Desktop",
  version: "v1.0.0",
  published: false,
  architecture: "Windows x64",
  artifacts: {
    exe: {
      fileName: "OPGeotech-Desktop-Setup-1.0.0.exe",
      size: null,
      sizeBytes: null,
      sha256: null,
      signed: false,
      downloadUrl: null,
    },
    msi: {
      fileName: "OPGeotech-Desktop-1.0.0.msi",
      size: null,
      sizeBytes: null,
      sha256: null,
      signed: false,
      downloadUrl: null,
    },
  },
};

function InstallerCard({
  title,
  subtitle,
  description,
  format,
  release,
}: {
  title: string;
  subtitle: string;
  description: string;
  format: "EXE" | "MSI";
  release: DesktopRelease;
}) {
  const artifact = release.artifacts[format.toLowerCase() as "exe" | "msi"];
  const available = Boolean(release.published && artifact.downloadUrl);

  return (
    <div className="flex h-full flex-col justify-between border border-foreground bg-white p-6">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Monitor className="h-8 w-8 text-red-600" />
            <div>
              <h2 className="text-lg font-bold uppercase">{title}</h2>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <span
            className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${available ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-amber-400 bg-amber-50 text-amber-800"}`}
          >
            {available ? "Ready" : "Build required"}
          </span>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="grid grid-cols-2 gap-px border border-slate-200 bg-slate-200 text-xs">
          <div className="bg-slate-50 p-3">
            <p className="uppercase tracking-wider text-muted-foreground">
              Release
            </p>
            <p className="mt-1 font-bold text-foreground">{release.version}</p>
          </div>
          <div className="bg-slate-50 p-3">
            <p className="uppercase tracking-wider text-muted-foreground">
              Architecture
            </p>
            <p className="mt-1 font-bold text-foreground">
              {release.architecture}
            </p>
          </div>
          <div className="bg-slate-50 p-3">
            <p className="uppercase tracking-wider text-muted-foreground">
              File size
            </p>
            <p
              className={`mt-1 font-bold ${artifact.size ? "text-foreground" : "text-amber-700"}`}
            >
              {artifact.size ?? "Pending build"}
            </p>
          </div>
          <div className="bg-slate-50 p-3">
            <p className="uppercase tracking-wider text-muted-foreground">
              Signature
            </p>
            <p
              className={`mt-1 font-bold ${artifact.signed ? "text-emerald-700" : "text-amber-700"}`}
            >
              {artifact.signed ? "Verified" : "Unsigned test build"}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {available ? (
          <a
            href={artifact.downloadUrl ?? undefined}
            download={artifact.fileName}
          >
            <Button className="w-full font-bold uppercase tracking-wider">
              <DownloadIcon className="mr-2 h-4 w-4" />
              Download {format} installer
            </Button>
          </a>
        ) : (
          <Button
            className="w-full font-bold uppercase tracking-wider"
            disabled
          >
            <DownloadIcon className="mr-2 h-4 w-4" />
            Download {format} installer
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          {available
            ? artifact.signed
              ? `Signed ${format} release artifact ready for download.`
              : `Test ${format} release artifact ready. Windows may display an unknown publisher warning.`
            : `The ${format} release artifact will be enabled after it is built on Windows and published.`}
        </p>
      </div>
    </div>
  );
}

export default function Download() {
  const [release, setRelease] = useState<DesktopRelease>(FALLBACK_RELEASE);

  useEffect(() => {
    const loadRelease = async () => {
      try {
        const response = await fetch(
          "https://api.github.com/repos/abdoulayekeita1063-a11y/opgeotech/releases/latest",
          {
            headers: { Accept: "application/vnd.github+json" },
            cache: "no-store",
          }
        );
        if (response.ok) {
          const latest = await response.json();
          const assets = Array.isArray(latest.assets) ? latest.assets : [];
          const findAsset = (extension: "exe" | "msi") =>
            assets.find((asset: { name?: string }) =>
              asset.name?.toLowerCase().endsWith(`.${extension}`)
            );
          const exe = findAsset("exe");
          const msi = findAsset("msi");
          if (exe && msi) {
            setRelease({
              product: "OPGeotech Desktop",
              version: latest.tag_name ?? "v1.0.0",
              published: true,
              architecture: "Windows x64",
              releaseUrl: latest.html_url ?? null,
              artifacts: {
                exe: {
                  fileName: exe.name,
                  sizeBytes: exe.size ?? null,
                  size: exe.size
                    ? `${(exe.size / 1024 / 1024).toFixed(1)} MB`
                    : null,
                  sha256: null,
                  signed: true,
                  downloadUrl: exe.browser_download_url ?? null,
                },
                msi: {
                  fileName: msi.name,
                  sizeBytes: msi.size ?? null,
                  size: msi.size
                    ? `${(msi.size / 1024 / 1024).toFixed(1)} MB`
                    : null,
                  sha256: null,
                  signed: true,
                  downloadUrl: msi.browser_download_url ?? null,
                },
              },
            });
            return;
          }
        }

        const fallbackResponse = await fetch("/desktop-release.json", {
          cache: "no-store",
        });
        if (fallbackResponse.ok) {
          const metadata = (await fallbackResponse.json()) as DesktopRelease;
          if (
            metadata?.version &&
            metadata.artifacts?.exe &&
            metadata.artifacts?.msi
          ) {
            setRelease(metadata);
          }
        }
      } catch {
        // Keep the local fallback metadata when GitHub is unavailable.
      }
    };

    void loadRelease();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <ModuleHeader
        index=""
        title="OPGeotech Desktop"
        module="Desktop Installer"
        description="Install OPGeotech on Windows with local project folders, secure pairing and automatic cloud synchronization."
      />

      <section className="mt-8 border border-red-200 bg-red-50/60 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
          <div className="space-y-1 text-sm">
            <p className="font-bold text-red-900">Windows release status</p>
            <p className="leading-6 text-red-900/80">
              {release.published
                ? "The latest Windows installers are available below. Download one installer and run it on Windows 10 or Windows 11."
                : "The signed EXE and MSI installers are not published yet. The source package below is for developers and cannot install OPGeotech by itself. Do not rename a ZIP file to EXE or run the PowerShell build scripts as an installer."}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <InstallerCard
          title="Windows EXE"
          subtitle="Inno Setup · Windows 10/11 64-bit"
          format="EXE"
          release={release}
          description="The guided installer creates the OPGeotech Desktop shortcut, local project folders and the 15-minute Windows Task Scheduler synchronization task."
        />
        <InstallerCard
          title="Windows MSI"
          subtitle="WiX Toolset · managed deployment"
          format="MSI"
          release={release}
          description="Use the MSI package for managed company deployment, software distribution tools and administrator-controlled Windows installations."
        />
      </section>

      <section className="mt-6 border border-foreground bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <FileArchive className="mt-0.5 h-6 w-6 text-red-600" />
            <div>
              <h2 className="text-lg font-bold uppercase">
                Developer source package — not an installer
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                This ZIP contains the EXE/MSI build definitions, PowerShell
                scripts, WiX file and signing script. It is not a Windows
                installer and requires a Windows build machine with Inno Setup
                and WiX.
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>
                  Package version:{" "}
                  <strong className="text-foreground">v1.0.0</strong>
                </span>
                <span>
                  Download size:{" "}
                  <strong className="text-foreground">9.5 KB</strong>
                </span>
              </div>
            </div>
          </div>
          <a
            href={SOURCE_PACKAGE_URL}
            download="OPGeotech-Desktop-Installer-Sources.zip"
          >
            <Button className="font-bold uppercase tracking-wider">
              <DownloadIcon className="mr-2 h-4 w-4" />
              Download developer sources (ZIP)
            </Button>
          </a>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="border border-foreground bg-white p-6">
          <div className="mb-5 flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-bold uppercase">
              First-time configuration
            </h2>
          </div>
          <ol className="space-y-4 text-sm">
            {[
              [
                "Create pairing file",
                "Open Team Workspace → Project Data Room, choose the synchronization mode and click Download pairing file.",
              ],
              [
                "Run the installer",
                "Keep the JSON pairing file in your Windows Downloads folder, then run the EXE or MSI installer as administrator.",
              ],
              [
                "Automatic setup",
                "The installer detects the pairing file without asking you to type the project token and creates the Windows synchronization task.",
              ],
              [
                "Open local files",
                "Browse to C:\\OPGeotech\\Projects to access the project folders and downloaded files.",
              ],
            ].map(([title, text], index) => (
              <li className="flex gap-3" key={title}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-red-600 text-xs font-bold text-white">
                  {index + 1}
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 leading-6 text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="border border-foreground bg-white p-6">
          <div className="mb-5 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-bold uppercase">
              Security and sync modes
            </h2>
          </div>
          <div className="space-y-4 text-sm">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p className="leading-6 text-muted-foreground">
                <strong className="text-foreground">
                  Cloud → Windows only:
                </strong>{" "}
                local files are never uploaded and are not silently deleted.
              </p>
            </div>
            <div className="flex gap-3">
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="leading-6 text-muted-foreground">
                <strong className="text-foreground">Bidirectional:</strong>{" "}
                local changes and new files can be uploaded; simultaneous
                changes are preserved as `.conflict-YYYYMMDD-HHMMSS` files.
              </p>
            </div>
            <div className="flex gap-3">
              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="leading-6 text-muted-foreground">
                The task{" "}
                <strong className="text-foreground">
                  OPGeotech Cloud Sync
                </strong>{" "}
                runs every 15 minutes and can be revoked from Team Workspace.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-dashed border-muted-foreground/50 p-5 text-sm">
        <div className="flex items-center gap-3">
          <Smartphone className="h-5 w-5 text-muted-foreground" />
          <p className="text-muted-foreground">
            You can still use OPGeotech in any modern browser or install the PWA
            on mobile.
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </section>
    </div>
  );
}
