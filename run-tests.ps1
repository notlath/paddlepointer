# Runs both test suites: the browser tests with node, and the API tests with php.
# The php tests need the disposable MySQL server described in tests/test_db.php.
# Failing suites are named; run that suite on its own to read the full output.

$failed = @()

$nodeOutput = & node --test 2>&1
$nodeCounts = $nodeOutput | Select-String -Pattern "^. (pass|fail) \d+"
if ($LASTEXITCODE -eq 0) {
  Write-Host ("PASS node --test  ({0})" -f (($nodeCounts -join ", ") -replace "^. ", "" -replace ", . ", ", "))
} else {
  $failed += "node --test"
  Write-Host "FAIL node --test"
  $nodeCounts | ForEach-Object { Write-Host ("  " + ($_ -replace "^. ", "")) }
  Write-Host "  run: node --test"
}

foreach ($test in Get-ChildItem (Join-Path $PSScriptRoot "tests\*_test.php")) {
  $output = & php $test.FullName 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host ("PASS {0}" -f $test.Name)
  } else {
    $failed += $test.Name
    Write-Host ("FAIL {0}" -f $test.Name)
    $output | Select-String -Pattern "^FAIL|expected|actual" | ForEach-Object { Write-Host ("  " + $_) }
    Write-Host ("  run: php tests/{0}" -f $test.Name)
  }
}

if ($failed.Count -gt 0) {
  Write-Host ("`n{0} failing: {1}" -f $failed.Count, ($failed -join ", "))
  exit 1
}

Write-Host "`nEvery test passed"
