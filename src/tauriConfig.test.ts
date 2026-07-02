import cargoManifest from "../src-tauri/Cargo.toml?raw";
import capabilityConfig from "../src-tauri/capabilities/default.json";
import tauriConfig from "../src-tauri/tauri.conf.json";
import macosTauriConfig from "../src-tauri/tauri.macos.conf.json";
import { describe, expect, it } from "vitest";

const config = tauriConfig as {
  app?: {
    security?: {
      assetProtocol?: {
        enable?: boolean;
        scope?: string[];
      };
      csp?: {
        [key: string]: unknown;
      };
    };
  };
};
const capability = capabilityConfig as {
  permissions?: string[];
};
const macosConfig = macosTauriConfig as {
  bundle?: {
    active?: boolean;
    targets?: string[];
    fileAssociations?: Array<{
      ext?: string[];
      role?: string;
      rank?: string;
    }>;
  };
};
const expectedMacosAssociationExts = [
  "txt",
  "md",
  "log",
  "json",
  "yaml",
  "yml",
  "toml",
  "xml",
  "ini",
  "conf",
];

describe("tauri asset and image CSP config", () => {
  it("enables bundled asset protocol access for local markdown images", () => {
    expect(config.app?.security?.assetProtocol?.enable).toBe(true);
    expect(config.app?.security?.assetProtocol?.scope).toContain("**");
  });

  it("allows bundled asset localhost images in CSP", () => {
    const imgSrc = config.app?.security?.csp?.["img-src"];

    expect(Array.isArray(imgSrc)).toBe(true);
    expect(imgSrc).toContain("asset:");
    expect(imgSrc).toContain("http://asset.localhost");
  });

  it("allows remote http and https images in bundled markdown preview", () => {
    const imgSrc = config.app?.security?.csp?.["img-src"];

    expect(Array.isArray(imgSrc)).toBe(true);
    expect(imgSrc).toContain("https:");
    expect(imgSrc).toContain("http:");
  });

  it("keeps the tauri protocol-asset feature enabled for release builds", () => {
    expect(cargoManifest).toContain('protocol-asset');
  });
  it("allows clipboard image reads for markdown image paste", () => {
    expect(capability.permissions).toContain("clipboard-manager:allow-read-image");
  });
});

describe("tauri macOS bundle config", () => {
  it("builds a local app bundle with file associations", () => {
    const association = macosConfig.bundle?.fileAssociations?.[0];

    expect(macosConfig.bundle?.active).toBe(true);
    expect(macosConfig.bundle?.targets).toEqual(["app"]);
    expect(association?.role).toBe("Editor");
    expect(association?.rank).toBe("Default");
    expect(association?.ext).toEqual(expectedMacosAssociationExts);
    expect(association?.ext?.every((ext) => !ext.startsWith("."))).toBe(true);
  });
});
