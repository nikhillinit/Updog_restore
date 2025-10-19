# Python Code Review Reference

## Table of Contents
1. Code Style and Formatting
2. Type Hints and Documentation
3. Error Handling
4. Performance Patterns
5. Security Best Practices
6. Testing Patterns
7. Common Anti-Patterns

## 1. Code Style and Formatting

### PEP 8 Essentials
- Use 4 spaces for indentation
- Max line length: 79 characters for code, 72 for docstrings
- Use snake_case for functions and variables, PascalCase for classes
- Two blank lines between top-level definitions, one between methods

### Import Organization
```python
# Standard library imports
import os
import sys

# Third-party imports
import numpy as np
import requests

# Local application imports
from myapp.models import User
from myapp.utils import format_date
```

### Naming Conventions
- `_single_leading_underscore`: weak "internal use" indicator
- `__double_leading_underscore`: name mangling for class attributes
- `UPPERCASE_WITH_UNDERSCORES`: constants
- Avoid single-letter names except for counters or iterators

## 2. Type Hints and Documentation

### Type Hints
```python
from typing import List, Dict, Optional, Union

def process_items(
    items: List[str], 
    config: Dict[str, int],
    limit: Optional[int] = None
) -> Union[List[str], None]:
    """
    Process items according to configuration.
    
    Args:
        items: List of items to process
        config: Configuration dictionary
        limit: Optional limit on items to process
        
    Returns:
        Processed items or None if processing fails
        
    Raises:
        ValueError: If config is invalid
    """
    pass
```

### Docstring Patterns
- Use triple double quotes for docstrings
- Include one-line summary, blank line, then detailed description
- Document all public APIs
- Use Google, NumPy, or Sphinx style consistently

## 3. Error Handling

### Specific Exceptions
```python
# ❌ Too broad
try:
    value = data['key']
except Exception:
    pass

# ✅ Specific and informative
try:
    value = data['key']
except KeyError as e:
    logger.error(f"Missing required key: {e}")
    raise ValueError(f"Configuration missing required field: {e}") from e
```

### Context Managers
```python
# ✅ Always use context managers for resources
with open('file.txt', 'r') as f:
    content = f.read()

# ✅ Custom context managers
from contextlib import contextmanager

@contextmanager
def managed_resource():
    resource = acquire_resource()
    try:
        yield resource
    finally:
        release_resource(resource)
```

### Never Silence Exceptions
```python
# ❌ Never do this
try:
    risky_operation()
except:
    pass

# ✅ At minimum, log it
try:
    risky_operation()
except Exception as e:
    logger.exception("Risky operation failed")
    # Re-raise or handle appropriately
```

## 4. Performance Patterns

### List Comprehensions vs Loops
```python
# ✅ Comprehensions for simple transformations
squares = [x**2 for x in range(10)]

# ✅ Generator expressions for large datasets
sum(x**2 for x in range(1000000))

# ❌ Don't use comprehensions for complex logic
# Use regular loops when readability suffers
```

### Avoid Repeated Calculations
```python
# ❌ Inefficient
for item in items:
    if len(items) > 100:
        process_large_batch(item)

# ✅ Calculate once
items_count = len(items)
for item in items:
    if items_count > 100:
        process_large_batch(item)
```

### Use Built-in Functions
```python
# ❌ Slower
result = []
for x in data:
    result.append(transform(x))

# ✅ Faster (C implementation)
result = list(map(transform, data))

# ✅ Most readable (usually preferred)
result = [transform(x) for x in data]
```

## 5. Security Best Practices

### Never Trust User Input
```python
# ❌ SQL Injection risk
cursor.execute(f"SELECT * FROM users WHERE name = '{user_input}'")

# ✅ Use parameterized queries
cursor.execute("SELECT * FROM users WHERE name = ?", (user_input,))
```

### Secrets Management
```python
# ❌ Hardcoded secrets
API_KEY = "sk_live_abc123xyz"

# ✅ Environment variables
import os
API_KEY = os.environ.get('API_KEY')
if not API_KEY:
    raise ValueError("API_KEY environment variable not set")
```

### Cryptographic Operations
```python
# ❌ Weak randomness for security
import random
token = random.randint(1000, 9999)

# ✅ Cryptographically secure
import secrets
token = secrets.token_urlsafe(32)
```

### Path Traversal Prevention
```python
import os
from pathlib import Path

# ✅ Validate and resolve paths
def safe_join(base_dir: Path, user_path: str) -> Path:
    full_path = (base_dir / user_path).resolve()
    if not str(full_path).startswith(str(base_dir.resolve())):
        raise ValueError("Path traversal attempt detected")
    return full_path
```

## 6. Testing Patterns

### Test Structure
```python
def test_user_creation():
    # Arrange
    username = "testuser"
    email = "test@example.com"
    
    # Act
    user = User.create(username=username, email=email)
    
    # Assert
    assert user.username == username
    assert user.email == email
    assert user.id is not None
```

### Fixtures and Mocking
```python
import pytest
from unittest.mock import Mock, patch

@pytest.fixture
def sample_user():
    return User(username="testuser", email="test@example.com")

def test_user_email_validation(sample_user):
    assert sample_user.validate_email()

@patch('myapp.services.external_api_call')
def test_with_mocked_api(mock_api):
    mock_api.return_value = {'status': 'success'}
    result = process_data()
    assert result['status'] == 'success'
```

### Test Coverage Goals
- Aim for 80%+ code coverage
- Test edge cases and error conditions
- Test public APIs thoroughly
- Integration tests for critical paths

## 7. Common Anti-Patterns

### Mutable Default Arguments
```python
# ❌ Dangerous!
def add_item(item, items=[]):
    items.append(item)
    return items

# ✅ Correct
def add_item(item, items=None):
    if items is None:
        items = []
    items.append(item)
    return items
```

### Using `is` for Value Comparison
```python
# ❌ Wrong for values
if x is 1000:
    pass

# ✅ Use == for values
if x == 1000:
    pass

# ✅ Use is only for identity checks
if x is None:
    pass
```

### Global State
```python
# ❌ Avoid global mutable state
global_cache = {}

def process(key):
    if key not in global_cache:
        global_cache[key] = expensive_operation(key)
    return global_cache[key]

# ✅ Use class attributes or dependency injection
class Processor:
    def __init__(self):
        self._cache = {}
    
    def process(self, key):
        if key not in self._cache:
            self._cache[key] = expensive_operation(key)
        return self._cache[key]
```

### String Concatenation in Loops
```python
# ❌ O(n²) complexity
result = ""
for item in items:
    result += str(item)

# ✅ O(n) complexity
result = "".join(str(item) for item in items)
```

### Bare `except:`
```python
# ❌ Catches everything, including KeyboardInterrupt
try:
    risky_operation()
except:
    handle_error()

# ✅ Be specific
try:
    risky_operation()
except (ValueError, KeyError) as e:
    handle_error(e)
```

## Review Checklist

When reviewing Python code, check for:

- [ ] Follows PEP 8 style guidelines
- [ ] Has appropriate type hints on public APIs
- [ ] Includes docstrings for public functions/classes
- [ ] Uses specific exception types
- [ ] Proper resource management (context managers)
- [ ] No hardcoded credentials or secrets
- [ ] Appropriate use of built-in functions
- [ ] Test coverage for new functionality
- [ ] No mutable default arguments
- [ ] Proper handling of None values
- [ ] Security considerations for user input
- [ ] Performance considerations for large datasets
