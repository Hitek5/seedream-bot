import { execFile } from "child_process";
import { writeFileSync, existsSync, mkdirSync, unlinkSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { analyzeImageForCAD } from "./vision.js";
import { generateWithClaude } from "./claude.js";

const CAD_CODE_SYSTEM_PROMPT = `You are a CadQuery expert. Generate Python code that creates the described mechanical part.

Rules:
- Start with: import cadquery as cq
- Build the part step by step using Workplane operations
- Use parametric variables at the top for ALL dimensions (in mm)
- Add fillets/chamfers LAST (they fail on invalid geometry)
- Export both STEP and STL at the end
- File paths: use sys.argv[1] as the output directory
- Save as: output_dir/model.step and output_dir/model.stl
- The code MUST run without errors with: python3 script.py /output/dir
- Add brief comments explaining each operation
- Keep it simple — prefer basic operations (extrude, cut, hole, fillet) over complex lofts
- If the description is ambiguous, make reasonable engineering assumptions

Output ONLY valid Python code. No markdown fences, no explanations before or after.

Example structure:
import cadquery as cq
import sys

output_dir = sys.argv[1]

# Dimensions (mm)
length = 100
width = 50
height = 20
hole_diameter = 8

# Build
result = (
    cq.Workplane("XY")
    .box(length, width, height)
    .faces(">Z")
    .workplane()
    .hole(hole_diameter)
    .edges("|Z")
    .fillet(2)
)

cq.exporters.export(result, f"{output_dir}/model.step")
cq.exporters.export(result, f"{output_dir}/model.stl")
print("OK")`;

export interface CADResult {
  stepPath: string;
  stlPath: string;
  code: string;
  description: string;
}

/**
 * Check if CadQuery is available on the system.
 */
export async function isCadQueryAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("/opt/cadquery-env/bin/python3", ["-c", "import cadquery; print('ok')"], { timeout: 10000 }, (err, stdout) => {
      resolve(!err && stdout.trim() === "ok");
    });
  });
}

/**
 * Full pipeline: image → description → CadQuery code → STEP/STL files.
 */
export async function generateCADFromImage(imageUrl: string): Promise<CADResult> {
  // Step 1: Describe the part with Claude Vision
  const description = await analyzeImageForCAD(imageUrl);

  // Step 2: Generate CadQuery code
  return generateCADFromDescription(description);
}

/**
 * Pipeline from text description: description → CadQuery code → STEP/STL files.
 */
export async function generateCADFromDescription(description: string): Promise<CADResult> {
  // Generate CadQuery code with Claude
  const code = await generateWithClaude(
    CAD_CODE_SYSTEM_PROMPT,
    `Create a CadQuery model for this part:\n\n${description}`,
    4096,
  );

  // Clean code (remove markdown fences if present)
  const cleanCode = code
    .replace(/^```python\n?/m, "")
    .replace(/^```\n?/m, "")
    .replace(/```$/m, "")
    .trim();

  // Execute the code
  return executeCADCode(cleanCode, description);
}

/**
 * Execute CadQuery Python code and return paths to generated files.
 */
async function executeCADCode(code: string, description: string): Promise<CADResult> {
  const workDir = join(tmpdir(), `cad_${randomBytes(6).toString("hex")}`);
  mkdirSync(workDir, { recursive: true });

  const scriptPath = join(workDir, "generate.py");
  writeFileSync(scriptPath, code, "utf-8");

  return new Promise((resolve, reject) => {
    execFile(
      "python3",
      [scriptPath, workDir],
      { timeout: 60000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          // Clean up script but keep error context
          console.error("[cad] Execution failed:", stderr || error.message);
          reject(new Error(`CAD generation failed: ${stderr || error.message}`));
          return;
        }

        const stepPath = join(workDir, "model.step");
        const stlPath = join(workDir, "model.stl");

        if (!existsSync(stepPath) && !existsSync(stlPath)) {
          reject(new Error("CAD code ran but produced no output files"));
          return;
        }

        resolve({
          stepPath: existsSync(stepPath) ? stepPath : "",
          stlPath: existsSync(stlPath) ? stlPath : "",
          code,
          description,
        });
      },
    );
  });
}

/**
 * Clean up temporary CAD files.
 */
export function cleanupCADFiles(result: CADResult): void {
  try {
    if (result.stepPath) unlinkSync(result.stepPath);
    if (result.stlPath) unlinkSync(result.stlPath);
    // Try to remove the script and directory
    const dir = result.stepPath
      ? join(result.stepPath, "..")
      : result.stlPath
        ? join(result.stlPath, "..")
        : null;
    if (dir) {
      try { unlinkSync(join(dir, "generate.py")); } catch {}
      try { require("fs").rmdirSync(dir); } catch {}
    }
  } catch {
    // ignore cleanup errors
  }
}
