# Security Policy for FocusBrowser

## Supported Versions  
- We support only the latest release of FocusBrowser.  
- Security fixes are provided on a best-effort basis; older versions may not receive timely updates.  

## Supported Platforms & Configurations  
FocusBrowser is distributed via the source on GitHub (under the MIT license). It is built using React Native + Expo, wrapping `react-native-webview`, and enforces a banned-host list fetched from a remote JSON endpoint. Vulnerabilities may depend on environment (Android / iOS / web) and runtime configuration (e.g. whether override of the banned-host list is enabled).  

## Reporting a Vulnerability  
If you discover a security vulnerability in FocusBrowser (for example cross-site scripting, insecure data storage, improper URL blocking, remote-code execution, or other security-critical issues), please report it ***privately*** to the maintainers — do **not** open a public issue.  

Send an email to: **FocusBrowser@bizbazboz.uk**  
*(replace with your preferred contact address)*  

If email is not possible, you may also use the “private” issue/bug-report channel — but only if you trust that the issue will not be publicly disclosed before a fix is available.  

### What to include in your report  
When reporting, please include:  
- A clear description of the vulnerability.  
- The version of FocusBrowser (commit / tag).  
- The platform (Android / iOS / web) and relevant configuration (e.g. whether override is enabled).  
- Steps to reproduce, if possible.  
- Impact assessment (what data or functionality is affected).  
- Any mitigation suggestions or possible patch.  

## Disclosure Policy  
- Give maintainers up to 14 calendar days to acknowledge receipt of a report.  
- Provide a reasonable time-window for a fix before public disclosure.  
- If a fix is not available within that period, public disclosure is permissible — but only after notifying maintainers.  

## Secure Development & Dependency Management  
- Review dependencies regularly and apply security updates promptly.  
- Avoid committing secrets (API keys, credentials) into the repository.  
- Use secret-scanning tools, dependency scanners (e.g. `npm audit` / GitHub Dependabot), and code scanning where feasible.  
- When merging changes — enforce code reviews to prevent accidental introduction of vulnerabilities (e.g. insecure URL-whitelisting bypass, improper input sanitization).  

## Limitations & Security Considerations  
FocusBrowser uses a remote banned-host list. As such, a potential risk is that a compromised CDN or a malicious JSON response may deliver a list that allows unwanted sites or manipulates blocking behavior. Users should only configure banned-host lists from trusted sources.  

Because FocusBrowser depends on a web-view and external web content, it inherits many of the general security risks of web content (e.g. XSS, phishing, malicious JS, mixed content). Blocking and URL-whitelisting/blacklisting are no replacement for a full sandboxed environment.  

## License & Disclaimer  
FocusBrowser is provided under the MIT License. Use at your own risk. No warranty or guarantee is provided regarding security or fitness for a particular purpose.  

---  

We highly appreciate responsible disclosure. Thank you for helping improve FocusBrowser’s security.  
