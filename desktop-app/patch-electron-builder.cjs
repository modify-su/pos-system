const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'node_modules', 'app-builder-lib', 'out', 'targets', 'nsis', 'NsisTarget.js');

if (fs.existsSync(targetFile)) {
  let content = fs.readFileSync(targetFile, 'utf8');
  const targetPattern = `if ((0, macosVersion_1.isMacOsCatalina)()) {
            try {
                await nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath);
            }
            catch (error) {
                builder_util_1.log.warn(\`packager.vm is used: \${error.message}\`);
                const vm = await packager.vm.value;
                await vm.exec(installerPath, []);
                // Parallels VM can exit after command execution, but NSIS continue to be running
                let i = 0;
                while (!(await (0, builder_util_2.exists)(uninstallerPath)) && i++ < 100) {
                    // noinspection JSUnusedLocalSymbols
                    await new Promise((resolve, _reject) => setTimeout(resolve, 300));
                }
            }
        }
        else {
            await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
        }`;

  const replacement = `try {
            await nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath);
        }
        catch (error) {
            if ((0, macosVersion_1.isMacOsCatalina)()) {
                builder_util_1.log.warn(\`packager.vm is used: \${error.message}\`);
                const vm = await packager.vm.value;
                await vm.exec(installerPath, []);
                // Parallels VM can exit after command execution, but NSIS continue to be running
                let i = 0;
                while (!(await (0, builder_util_2.exists)(uninstallerPath)) && i++ < 100) {
                    // noinspection JSUnusedLocalSymbols
                    await new Promise((resolve, _reject) => setTimeout(resolve, 300));
                }
            }
            else {
                await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
            }
        }`;

  if (content.includes(targetPattern)) {
    content = content.replace(targetPattern, replacement);
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('✓ Patched electron-builder NsisTarget.js for Windows SAC compatibility');
  } else {
    console.log('• electron-builder NsisTarget.js already patched or pattern not found');
  }
}
