$ErrorActionPreference = "Stop"

$src = Split-Path -Parent $PSScriptRoot
$temp = Join-Path $env:TEMP ("secureguard-site-" + [guid]::NewGuid().ToString())
$tgz = Join-Path $temp "project.tgz"

try {
    New-Item -ItemType Directory -Path $temp | Out-Null

    tar.exe -czf $tgz --exclude=node_modules --exclude=.git --exclude=.env --exclude=.env.* -C $src .

    $response = curl.exe -s -X POST "https://codex-deploy-skills.vercel.sh/api/deploy" -F "file=@$tgz" -F "framework=vite"
    if (-not $response) {
        throw "Resposta vazia do endpoint de deploy."
    }

    $json = $response | ConvertFrom-Json
    if ($json.error) {
        throw $json.error
    }

    if (-not $json.previewUrl) {
        throw "Resposta sem previewUrl."
    }

    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        $status = curl.exe -s -o NUL -w "%{http_code}" $json.previewUrl
        if ([int]$status -eq 200 -or ([int]$status -ge 400 -and [int]$status -lt 500)) {
            $ready = $true
            break
        }

        Start-Sleep -Seconds 5
    }

    Write-Output ("PREVIEW_URL=" + $json.previewUrl)
    Write-Output ("CLAIM_URL=" + $json.claimUrl)
    Write-Output ("DEPLOYMENT_ID=" + $json.deploymentId)
    Write-Output ("PROJECT_ID=" + $json.projectId)
    Write-Output ("READY=" + $ready)
}
finally {
    if (Test-Path $temp) {
        Remove-Item -Recurse -Force $temp
    }
}
