# Rotates an unrigged character GLB so the figure faces +Z (what auto-riggers expect).
# Works out which way the character faces from the feet: toes reach further from the ankle than heels do,
# and the arm span tells us which horizontal axis is "sideways".
# Usage: powershell -File tools\glb-face-forward.ps1 -In mesh.glb -Out mesh_fixed.glb
param([Parameter(Mandatory = $true)][string]$In, [Parameter(Mandatory = $true)][string]$Out)
$bytes = [IO.File]::ReadAllBytes($In)
$jsonLen = [BitConverter]::ToUInt32($bytes, 12)
$j = [Text.Encoding]::UTF8.GetString($bytes, 20, $jsonLen) | ConvertFrom-Json
$binHdr = 20 + $jsonLen; $binLen = [BitConverter]::ToUInt32($bytes, $binHdr); $binStart = $binHdr + 8
function Acc($idx) {
  $a = $j.accessors[$idx]; $bv = $j.bufferViews[$a.bufferView]
  $bo = 0; if ($bv.byteOffset) { $bo = [int]$bv.byteOffset }; $ao = 0; if ($a.byteOffset) { $ao = [int]$a.byteOffset }
  $st = 12; if ($bv.byteStride) { $st = [int]$bv.byteStride }
  return @{ off = $binStart + $bo + $ao; stride = $st; count = [int]$a.count; idx = $idx }
}
$posAcc = @(); $nrmAcc = @()
foreach ($m in $j.meshes) { foreach ($p in $m.primitives) { $posAcc += (Acc $p.attributes.POSITION); if ($null -ne $p.attributes.NORMAL) { $nrmAcc += (Acc $p.attributes.NORMAL) } } }

# bounds
$mn = @(1e9, 1e9, 1e9); $mx = @(-1e9, -1e9, -1e9)
foreach ($A in $posAcc) { for ($i = 0; $i -lt $A.count; $i++) { $o = $A.off + $i * $A.stride; for ($c = 0; $c -lt 3; $c++) { $v = [BitConverter]::ToSingle($bytes, $o + 4 * $c); if ($v -lt $mn[$c]) { $mn[$c] = $v }; if ($v -gt $mx[$c]) { $mx[$c] = $v } } } }
$H = $mx[1] - $mn[1]
$lateral = 0; if (($mx[2] - $mn[2]) -gt ($mx[0] - $mn[0])) { $lateral = 2 }      # arms span this axis
$fa = 2 - $lateral                                                                 # so the figure faces along the other one
$solMin = 1e9; $solMax = -1e9; $ank = 0.0; $na = 0
foreach ($A in $posAcc) { for ($i = 0; $i -lt $A.count; $i++) { $o = $A.off + $i * $A.stride
  $y = ([BitConverter]::ToSingle($bytes, $o + 4) - $mn[1]) / $H; $f = [BitConverter]::ToSingle($bytes, $o + 4 * $fa)
  if ($y -lt 0.03) { if ($f -lt $solMin) { $solMin = $f }; if ($f -gt $solMax) { $solMax = $f } } elseif ($y -gt 0.09 -and $y -lt 0.13) { $ank += $f; $na++ } } }
$ank = $ank / [Math]::Max(1, $na)
$plus = ($solMax - $ank) -gt ($ank - $solMin)
$axisName = @('x', 'y', 'z')[$fa]; $sign = '-'; if ($plus) { $sign = '+' }
Write-Host ("{0}: faces {1}{2}  (toe reach {3:N3} vs heel {4:N3}, height {5:N3})" -f (Split-Path $In -Leaf), $sign, $axisName, [Math]::Max($solMax - $ank, $ank - $solMin), [Math]::Min($solMax - $ank, $ank - $solMin), $H)

# rotation about Y that takes the facing direction to +Z:  new = (ra*x + rb*z, y, rc*x + rd*z)
if ($fa -eq 0 -and $plus) { $ra = 0; $rb = -1; $rc = 1; $rd = 0 }
elseif ($fa -eq 0) { $ra = 0; $rb = 1; $rc = -1; $rd = 0 }
elseif ($plus) { $ra = 1; $rb = 0; $rc = 0; $rd = 1 }
else { $ra = -1; $rb = 0; $rc = 0; $rd = -1 }
foreach ($A in ($posAcc + $nrmAcc)) { for ($i = 0; $i -lt $A.count; $i++) { $o = $A.off + $i * $A.stride
  $x = [BitConverter]::ToSingle($bytes, $o); $z = [BitConverter]::ToSingle($bytes, $o + 8)
  [Array]::Copy([BitConverter]::GetBytes([single]($ra * $x + $rb * $z)), 0, $bytes, $o, 4)
  [Array]::Copy([BitConverter]::GetBytes([single]($rc * $x + $rd * $z)), 0, $bytes, $o + 8, 4) } }
foreach ($A in $posAcc) {
  $acc = $j.accessors[$A.idx]; $lo = @([double]$acc.min[0], [double]$acc.min[1], [double]$acc.min[2]); $hi = @([double]$acc.max[0], [double]$acc.max[1], [double]$acc.max[2])
  $xs = @(($ra * $lo[0] + $rb * $lo[2]), ($ra * $hi[0] + $rb * $hi[2]), ($ra * $lo[0] + $rb * $hi[2]), ($ra * $hi[0] + $rb * $lo[2]))
  $zs = @(($rc * $lo[0] + $rd * $lo[2]), ($rc * $hi[0] + $rd * $hi[2]), ($rc * $lo[0] + $rd * $hi[2]), ($rc * $hi[0] + $rd * $lo[2]))
  $acc.min = @(($xs | Measure-Object -Minimum).Minimum, $lo[1], ($zs | Measure-Object -Minimum).Minimum)
  $acc.max = @(($xs | Measure-Object -Maximum).Maximum, $hi[1], ($zs | Measure-Object -Maximum).Maximum)
}
$jb = [Text.Encoding]::UTF8.GetBytes(($j | ConvertTo-Json -Depth 40 -Compress)); $pad = (4 - ($jb.Length % 4)) % 4
$ms = New-Object IO.MemoryStream; $bw = New-Object IO.BinaryWriter($ms)
$bw.Write([uint32]0x46546C67); $bw.Write([uint32]2); $bw.Write([uint32](12 + 8 + $jb.Length + $pad + 8 + $binLen))
$bw.Write([uint32]($jb.Length + $pad)); $bw.Write([uint32]0x4E4F534A); $bw.Write($jb); for ($i = 0; $i -lt $pad; $i++) { $bw.Write([byte]0x20) }
$bw.Write([uint32]$binLen); $bw.Write([uint32]0x004E4942); $bw.Write($bytes, $binStart, $binLen); $bw.Flush()
[IO.File]::WriteAllBytes($Out, $ms.ToArray()); $bw.Close()
