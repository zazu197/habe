"""Optional fixture SSIM comparison. Requires Pillow and NumPy; never claims native Spotify parity."""
from pathlib import Path
import json
import numpy as np
from PIL import Image

root = Path('docs/screenshots')
region = (112, 104, 1548, 958)  # Original settings content; excludes allowed chrome/provider/player additions.
before = Image.open(root / 'reference-settings-1920.png').convert('RGB').crop(region)
after = Image.open(root / 'fixture-settings-1920.png').convert('RGB').crop(region)
a, b = np.asarray(before, dtype=np.float64), np.asarray(after, dtype=np.float64)
kernel = np.exp(-(np.arange(11) - 5) ** 2 / (2 * 1.5 ** 2))
kernel /= kernel.sum()

def gaussian(values):
    result = values
    for axis in (0, 1):
        padding = [(0, 0)] * values.ndim
        padding[axis] = (5, 5)
        padded = np.pad(result, padding, mode='reflect')
        pieces = []
        for index, weight in enumerate(kernel):
            selection = [slice(None)] * values.ndim
            selection[axis] = slice(index, index + values.shape[axis])
            pieces.append(weight * padded[tuple(selection)])
        result = sum(pieces)
    return result

ma, mb = gaussian(a), gaussian(b)
va, vb = gaussian(a * a) - ma * ma, gaussian(b * b) - mb * mb
cov = gaussian(a * b) - ma * mb
c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
score = float(np.mean(((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2))))
Image.blend(before, after, 0.5).save(root / 'settings-overlay.png')
diff = np.clip(np.abs(a - b) * 4, 0, 255).astype(np.uint8)
Image.fromarray(diff).save(root / 'settings-difference.png')
result = {'kind': 'headless matched fixture settings region; not native Spotify parity', 'region': region, 'ssim': score,
          'gaussian_window': 11, 'sigma': 1.5, 'mean_absolute_pixel_error': float(np.mean(np.abs(a-b))),
          'excluded': ['native window chrome', 'provider pills', 'new sidebar entries', 'player', 'right lyrics panel']}
(root / 'visual-comparison.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result))
