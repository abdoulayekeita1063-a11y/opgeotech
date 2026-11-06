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

function InstallerCard({
  title,
  subtitle,
  description,
  format,
}: {
  title: string;
  subtitle: string;
  description: string;
  format: "EXE" | "MSI";
}) {
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
          <span className="border border-amber-400 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">
            Build required
          </span>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="mt-6 space-y-3">
        <Button className="w-full font-bold uppercase tracking-wider" disabled>
          <DownloadIcon className="mr-2 h-4 w-4" />
          Download {format} installer
        </Button>
        <p className="text-xs text-muted-foreground">
          The signed {format} release artifact will be enabled after it is built
          on Windows and published by the project administrator.
        </p>
      </div>
    </div>
  );
}

export default function Download() {
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
              The installer sources are ready. EXE and MSI buttons will become
              active after the release binaries are compiled on Windows and
              digitally signed with the organization certificate. Do not use an
              unsigned or unofficial installer for production data.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <InstallerCard
          title="Windows EXE"
          subtitle="Inno Setup · Windows 10/11 64-bit"
          format="EXE"
          description="The guided installer creates the OPGeotech Desktop shortcut, local project folders and the 15-minute Windows Task Scheduler synchronization task."
        />
        <InstallerCard
          title="Windows MSI"
          subtitle="WiX Toolset · managed deployment"
          format="MSI"
          description="Use the MSI package for managed company deployment, software distribution tools and administrator-controlled Windows installations."
        />
      </section>

      <section className="mt-6 border border-foreground bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <FileArchive className="mt-0.5 h-6 w-6 text-red-600" />
            <div>
              <h2 className="text-lg font-bold uppercase">
                Installer source package
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Download the EXE and MSI build definitions, PowerShell
                installer, pairing support, bidirectional sync agent, WiX file
                and signing script. Compile the final binaries on a trusted
                Windows build machine.
              </p>
            </div>
          </div>
          <a
            href={SOURCE_PACKAGE_URL}
            download="OPGeotech-Desktop-Installer-Sources.zip"
          >
            <Button className="font-bold uppercase tracking-wider">
              <DownloadIcon className="mr-2 h-4 w-4" />
              Download source package
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
