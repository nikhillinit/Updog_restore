#!/usr/bin/env python3
"""
Detect common security vulnerabilities and anti-patterns in code.
Provides a quick security scan before deeper review.
"""

import re
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import List


@dataclass
class SecurityIssue:
    severity: str  # Critical, High, Medium, Low
    category: str
    line_number: int
    line_content: str
    description: str


def check_python_security(content: str, filepath: str) -> List[SecurityIssue]:
    """Check Python code for security issues."""
    issues = []
    lines = content.split('\n')
    
    for i, line in enumerate(lines, 1):
        # SQL Injection risks
        if re.search(r'execute\s*\([^)]*\+[^)]*\)', line) or re.search(r'execute\s*\([^)]*%[^)]*\)', line):
            issues.append(SecurityIssue(
                severity='Critical',
                category='SQL Injection',
                line_number=i,
                line_content=line.strip(),
                description='Potential SQL injection: use parameterized queries instead of string concatenation'
            ))
        
        # eval() and exec() usage
        if re.search(r'\beval\s*\(', line) or re.search(r'\bexec\s*\(', line):
            issues.append(SecurityIssue(
                severity='Critical',
                category='Code Injection',
                line_number=i,
                line_content=line.strip(),
                description='Dangerous use of eval() or exec(): can execute arbitrary code'
            ))
        
        # Hardcoded secrets
        if re.search(r'(?:password|secret|api_key|token)\s*=\s*["\'][^"\']{8,}["\']', line, re.IGNORECASE):
            issues.append(SecurityIssue(
                severity='High',
                category='Hardcoded Credentials',
                line_number=i,
                line_content=line.strip(),
                description='Potential hardcoded secret: use environment variables or secret management'
            ))
        
        # Unsafe deserialization
        if 'pickle.loads' in line or 'yaml.load(' in line:
            issues.append(SecurityIssue(
                severity='High',
                category='Unsafe Deserialization',
                line_number=i,
                line_content=line.strip(),
                description='Unsafe deserialization: use safe_load() for YAML or avoid pickle for untrusted data'
            ))
        
        # Shell injection risks
        if re.search(r'os\.system\s*\([^)]*\+', line) or re.search(r'subprocess\.(?:call|run|Popen)\([^)]*shell\s*=\s*True', line):
            issues.append(SecurityIssue(
                severity='High',
                category='Command Injection',
                line_number=i,
                line_content=line.strip(),
                description='Potential command injection: avoid shell=True and validate inputs'
            ))
        
        # Insecure random
        if re.search(r'\brandom\.(?:random|randint|choice)\b', line):
            issues.append(SecurityIssue(
                severity='Medium',
                category='Weak Randomness',
                line_number=i,
                line_content=line.strip(),
                description='Using non-cryptographic random: use secrets module for security-critical operations'
            ))
        
        # Debug mode in production indicators
        if re.search(r'DEBUG\s*=\s*True', line, re.IGNORECASE):
            issues.append(SecurityIssue(
                severity='Medium',
                category='Debug Mode',
                line_number=i,
                line_content=line.strip(),
                description='Debug mode enabled: ensure this is disabled in production'
            ))
    
    return issues


def check_javascript_security(content: str, filepath: str) -> List[SecurityIssue]:
    """Check JavaScript/TypeScript code for security issues."""
    issues = []
    lines = content.split('\n')
    
    for i, line in enumerate(lines, 1):
        # eval() usage
        if re.search(r'\beval\s*\(', line):
            issues.append(SecurityIssue(
                severity='Critical',
                category='Code Injection',
                line_number=i,
                line_content=line.strip(),
                description='Dangerous use of eval(): can execute arbitrary code'
            ))
        
        # innerHTML with user input
        if re.search(r'\.innerHTML\s*=', line):
            issues.append(SecurityIssue(
                severity='High',
                category='XSS Vulnerability',
                line_number=i,
                line_content=line.strip(),
                description='Potential XSS via innerHTML: use textContent or sanitize input'
            ))
        
        # Hardcoded secrets
        if re.search(r'(?:password|secret|apiKey|token)\s*[:=]\s*["\'][^"\']{8,}["\']', line, re.IGNORECASE):
            issues.append(SecurityIssue(
                severity='High',
                category='Hardcoded Credentials',
                line_number=i,
                line_content=line.strip(),
                description='Potential hardcoded secret: use environment variables'
            ))
        
        # Dangerous functions
        if 'dangerouslySetInnerHTML' in line:
            issues.append(SecurityIssue(
                severity='High',
                category='XSS Vulnerability',
                line_number=i,
                line_content=line.strip(),
                description='Using dangerouslySetInnerHTML: ensure content is sanitized'
            ))
        
        # SQL string concatenation
        if re.search(r'(?:SELECT|INSERT|UPDATE|DELETE).*\+.*FROM', line, re.IGNORECASE):
            issues.append(SecurityIssue(
                severity='High',
                category='SQL Injection',
                line_number=i,
                line_content=line.strip(),
                description='Potential SQL injection: use parameterized queries'
            ))
        
        # Weak crypto
        if re.search(r'Math\.random\(\)', line):
            issues.append(SecurityIssue(
                severity='Medium',
                category='Weak Randomness',
                line_number=i,
                line_content=line.strip(),
                description='Using Math.random(): use crypto.randomBytes() for security-critical operations'
            ))
        
        # console.log in production code
        if 'console.log' in line and 'node_modules' not in filepath:
            issues.append(SecurityIssue(
                severity='Low',
                category='Information Disclosure',
                line_number=i,
                line_content=line.strip(),
                description='console.log() found: may expose sensitive information in production'
            ))
    
    return issues


def analyze_file(filepath: Path) -> List[SecurityIssue]:
    """Analyze a file for security issues."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return [SecurityIssue('Low', 'File Error', 0, '', f'Could not read file: {e}')]
    
    ext = filepath.suffix.lower()
    if ext == '.py':
        return check_python_security(content, str(filepath))
    elif ext in ['.js', '.jsx', '.ts', '.tsx']:
        return check_javascript_security(content, str(filepath))
    
    return []


def main():
    if len(sys.argv) < 2:
        print("Usage: python security_scan.py <file_or_directory>")
        sys.exit(1)
    
    path = Path(sys.argv[1])
    all_issues = []
    
    if path.is_file():
        all_issues = analyze_file(path)
    elif path.is_dir():
        for ext in ['*.py', '*.js', '*.jsx', '*.ts', '*.tsx']:
            for file in path.rglob(ext):
                issues = analyze_file(file)
                for issue in issues:
                    all_issues.append((str(file), issue))
    else:
        print(f"Error: {path} is not a valid file or directory")
        sys.exit(1)
    
    # Print results
    print("\n" + "="*80)
    print("SECURITY SCAN RESULTS")
    print("="*80)
    
    if not all_issues:
        print("\n✅ No security issues detected!")
        return
    
    # Group by severity
    by_severity = {'Critical': [], 'High': [], 'Medium': [], 'Low': []}
    for item in all_issues:
        if isinstance(item, tuple):
            filepath, issue = item
            by_severity[issue.severity].append((filepath, issue))
        else:
            by_severity[item.severity].append(('', item))
    
    # Print by severity
    severity_symbols = {'Critical': '🔴', 'High': '🟠', 'Medium': '🟡', 'Low': '🟢'}
    
    for severity in ['Critical', 'High', 'Medium', 'Low']:
        issues = by_severity[severity]
        if not issues:
            continue
        
        print(f"\n{severity_symbols[severity]} {severity.upper()} SEVERITY ({len(issues)} issues)")
        print("-" * 80)
        
        for filepath, issue in issues:
            if filepath:
                print(f"\n📄 {filepath}:{issue.line_number}")
            print(f"   Category: {issue.category}")
            print(f"   {issue.description}")
            if issue.line_content:
                print(f"   Code: {issue.line_content[:100]}")
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    total = sum(len(issues) for issues in by_severity.values())
    print(f"\nTotal issues found: {total}")
    for severity in ['Critical', 'High', 'Medium', 'Low']:
        count = len(by_severity[severity])
        if count > 0:
            print(f"  {severity_symbols[severity]} {severity}: {count}")
    
    if by_severity['Critical'] or by_severity['High']:
        print("\n⚠️  ATTENTION: Critical or High severity issues require immediate attention!")


if __name__ == '__main__':
    main()
