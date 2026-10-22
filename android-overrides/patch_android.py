"""Patches the generated Capacitor Android project: landscape lock, fullscreen activity, launcher icons."""
import pathlib, re, shutil, sys

root = pathlib.Path('android/app/src/main')
manifest = root / 'AndroidManifest.xml'
text = manifest.read_text()
if 'screenOrientation' not in text:
    text, n = re.subn(r'<activity(\s)', r'<activity android:screenOrientation="sensorLandscape"\1', text, count=1)
    if n != 1:
        sys.exit('Could not find <activity> in AndroidManifest.xml')
manifest.write_text(text)
print('manifest: landscape ok')

mains = list((root / 'java').rglob('MainActivity.java'))
if mains:
    shutil.copy('android-overrides/MainActivity.java', mains[0])
    print('MainActivity replaced:', mains[0])
else:
    print('MainActivity.java not found, skipping fullscreen patch')

res = root / 'res'
shutil.rmtree(res / 'mipmap-anydpi-v26', ignore_errors=True)
for src in pathlib.Path('android-overrides/res').rglob('*.png'):
    dst = res / src.relative_to('android-overrides/res')
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, dst)
print('icons copied')
