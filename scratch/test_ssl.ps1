try {
    $tcp = New-Object System.Net.Sockets.TcpClient('110.172.28.38', 443)
    $callback = [System.Net.Security.RemoteCertificateValidationCallback]{ $true }
    $ssl = New-Object System.Net.Security.SslStream($tcp.GetStream(), $false, $callback)
    $ssl.AuthenticateAsClient('dungicl.store')
    Write-Host "SUCCESS"
    Write-Host "Protocol: $($ssl.SslProtocol)"
    Write-Host "Cipher: $($ssl.CipherAlgorithm)"
    Write-Host "CipherStrength: $($ssl.CipherStrength)"
    $ssl.Close()
    $tcp.Close()
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
    if ($_.Exception.InnerException) {
        Write-Host "Inner: $($_.Exception.InnerException.Message)"
    }
}
