#!/usr/bin/env python3
"""
Analyze code complexity metrics to identify potential problem areas.
Supports Python, JavaScript, and TypeScript files.
"""

import re
import sys
from pathlib import Path
from collections import defaultdict


def count_lines(content):
    """Count total, code, and comment lines."""
    lines = content.split('\n')
    total = len(lines)
    code = sum(1 for line in lines if line.strip() and not line.strip().startswith('#') and not line.strip().startswith('//'))
    comments = sum(1 for line in lines if line.strip().startswith('#') or line.strip().startswith('//'))
    return {'total': total, 'code': code, 'comments': comments}


def analyze_python(content):
    """Analyze Python-specific metrics."""
    metrics = {}
    
    # Function count and lengths
    functions = re.findall(r'^def \w+\([^)]*\):', content, re.MULTILINE)
    metrics['function_count'] = len(functions)
    
    # Class count
    classes = re.findall(r'^class \w+[:(]', content, re.MULTILINE)
    metrics['class_count'] = len(classes)
    
    # Nested depth (approximation using indentation)
    max_indent = 0
    for line in content.split('\n'):
        if line.strip():
            indent = len(line) - len(line.lstrip())
            max_indent = max(max_indent, indent // 4)
    metrics['max_nesting_depth'] = max_indent
    
    # Import count
    imports = re.findall(r'^(?:from .+ )?import .+', content, re.MULTILINE)
    metrics['import_count'] = len(imports)
    
    return metrics


def analyze_javascript(content):
    """Analyze JavaScript/TypeScript-specific metrics."""
    metrics = {}
    
    # Function count (including arrow functions)
    functions = re.findall(r'(?:function\s+\w+|const\s+\w+\s*=\s*(?:\([^)]*\)|[^=]+)\s*=>)', content)
    metrics['function_count'] = len(functions)
    
    # Class count
    classes = re.findall(r'class\s+\w+', content)
    metrics['class_count'] = len(classes)
    
    # Nested depth (approximation using braces)
    max_depth = 0
    current_depth = 0
    for char in content:
        if char == '{':
            current_depth += 1
            max_depth = max(max_depth, current_depth)
        elif char == '}':
            current_depth = max(0, current_depth - 1)
    metrics['max_nesting_depth'] = max_depth
    
    # Import/require count
    imports = re.findall(r'(?:import .+ from|require\()', content)
    metrics['import_count'] = len(imports)
    
    return metrics


def analyze_file(filepath):
    """Analyze a single file and return metrics."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return {'error': str(e)}
    
    result = {'file': str(filepath)}
    result.update(count_lines(content))
    
    ext = Path(filepath).suffix.lower()
    if ext == '.py':
        result.update(analyze_python(content))
        result['language'] = 'Python'
    elif ext in ['.js', '.jsx', '.ts', '.tsx']:
        result.update(analyze_javascript(content))
        result['language'] = 'JavaScript/TypeScript'
    else:
        result['language'] = 'Unknown'
    
    # Calculate complexity score
    score = 0
    if result['code'] > 300:
        score += 2
    elif result['code'] > 150:
        score += 1
    
    if result.get('max_nesting_depth', 0) > 4:
        score += 2
    elif result.get('max_nesting_depth', 0) > 3:
        score += 1
    
    if result.get('function_count', 0) > 15:
        score += 1
    
    result['complexity_score'] = score
    result['complexity_level'] = ['Low', 'Medium', 'High', 'Very High'][min(score, 3)]
    
    return result


def main():
    if len(sys.argv) < 2:
        print("Usage: python analyze_complexity.py <file_or_directory>")
        sys.exit(1)
    
    path = Path(sys.argv[1])
    results = []
    
    if path.is_file():
        results.append(analyze_file(path))
    elif path.is_dir():
        for ext in ['*.py', '*.js', '*.jsx', '*.ts', '*.tsx']:
            results.extend([analyze_file(f) for f in path.rglob(ext)])
    else:
        print(f"Error: {path} is not a valid file or directory")
        sys.exit(1)
    
    # Print results
    print("\n" + "="*80)
    print("CODE COMPLEXITY ANALYSIS")
    print("="*80)
    
    for result in sorted(results, key=lambda x: x.get('complexity_score', 0), reverse=True):
        if 'error' in result:
            print(f"\n❌ {result['file']}: {result['error']}")
            continue
        
        print(f"\n📄 {result['file']}")
        print(f"   Language: {result['language']}")
        print(f"   Lines: {result['code']} code, {result['comments']} comments, {result['total']} total")
        if 'function_count' in result:
            print(f"   Functions: {result['function_count']}, Classes: {result['class_count']}")
            print(f"   Max Nesting: {result['max_nesting_depth']}, Imports: {result['import_count']}")
        print(f"   Complexity: {result['complexity_level']} (score: {result['complexity_score']})")
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    high_complexity = [r for r in results if r.get('complexity_score', 0) >= 3]
    if high_complexity:
        print(f"\n⚠️  {len(high_complexity)} file(s) with high complexity:")
        for r in high_complexity:
            print(f"   - {r['file']}")
    else:
        print("\n✅ No high-complexity files detected")
    
    print(f"\nTotal files analyzed: {len(results)}")
    avg_lines = sum(r.get('code', 0) for r in results) / len(results) if results else 0
    print(f"Average code lines per file: {avg_lines:.1f}")


if __name__ == '__main__':
    main()
