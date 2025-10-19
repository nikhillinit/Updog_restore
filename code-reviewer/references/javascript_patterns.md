# JavaScript/TypeScript Code Review Reference

## Table of Contents
1. Modern JavaScript Patterns
2. TypeScript Best Practices
3. Async/Await Patterns
4. React Patterns
5. Security Considerations
6. Performance Optimization
7. Common Pitfalls

## 1. Modern JavaScript Patterns

### Variable Declarations
```javascript
// ✅ Use const by default
const apiUrl = 'https://api.example.com';

// ✅ Use let for reassignment
let counter = 0;
counter++;

// ❌ Avoid var (function scope, hoisting issues)
var oldStyle = 'avoid';
```

### Destructuring
```javascript
// ✅ Object destructuring
const { name, age, email } = user;
const { data: { results } } = apiResponse;

// ✅ Array destructuring
const [first, second, ...rest] = array;

// ✅ Function parameters
function createUser({ name, email, role = 'user' }) {
  // ...
}
```

### Spread and Rest Operators
```javascript
// ✅ Object merging
const defaults = { theme: 'light', lang: 'en' };
const userPrefs = { lang: 'fr' };
const settings = { ...defaults, ...userPrefs };

// ✅ Array operations
const combined = [...array1, ...array2];
const [first, ...remaining] = items;

// ✅ Function rest parameters
function sum(...numbers) {
  return numbers.reduce((a, b) => a + b, 0);
}
```

### Arrow Functions
```javascript
// ✅ Concise for simple operations
const double = x => x * 2;
const add = (a, b) => a + b;

// ✅ Implicit return with objects (use parentheses)
const createUser = (name, email) => ({ name, email });

// ❌ Don't use arrow functions for methods that need 'this'
class Counter {
  count = 0;
  
  // ❌ Won't work as expected
  increment = () => {
    this.count++;
  }
  
  // ✅ Use regular method
  increment() {
    this.count++;
  }
}
```

## 2. TypeScript Best Practices

### Type Definitions
```typescript
// ✅ Define interfaces for object shapes
interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  metadata?: Record<string, unknown>;
}

// ✅ Use type aliases for unions and complex types
type Result<T> = { success: true; data: T } | { success: false; error: string };

// ✅ Generic types
function fetchData<T>(url: string): Promise<T> {
  return fetch(url).then(res => res.json());
}
```

### Avoid 'any'
```typescript
// ❌ Defeats the purpose of TypeScript
function process(data: any) {
  return data.someProperty;
}

// ✅ Use specific types
function process(data: UserData) {
  return data.someProperty;
}

// ✅ Use unknown if type is truly unknown
function process(data: unknown) {
  if (typeof data === 'object' && data !== null && 'someProperty' in data) {
    return (data as { someProperty: string }).someProperty;
  }
  throw new Error('Invalid data');
}
```

### Utility Types
```typescript
// ✅ Partial - make all properties optional
type PartialUser = Partial<User>;

// ✅ Pick - select specific properties
type UserCredentials = Pick<User, 'email' | 'password'>;

// ✅ Omit - exclude specific properties
type PublicUser = Omit<User, 'password'>;

// ✅ Record - create object type with specific keys
type UserRoles = Record<string, 'admin' | 'user'>;

// ✅ NonNullable - remove null and undefined
type RequiredValue = NonNullable<string | null | undefined>;
```

### Type Guards
```typescript
// ✅ Type guard functions
function isUser(obj: unknown): obj is User {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj &&
    'email' in obj
  );
}

// ✅ Using type guards
function processData(data: unknown) {
  if (isUser(data)) {
    // data is now typed as User
    console.log(data.name);
  }
}
```

## 3. Async/Await Patterns

### Error Handling
```javascript
// ❌ Unhandled promise rejection
async function fetchUser(id) {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}

// ✅ Proper error handling
async function fetchUser(id) {
  try {
    const response = await fetch(`/api/users/${id}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw error; // Re-throw or return default value
  }
}
```

### Parallel vs Sequential
```javascript
// ❌ Sequential (slow)
const user = await fetchUser(id);
const posts = await fetchPosts(id);
const comments = await fetchComments(id);

// ✅ Parallel (fast)
const [user, posts, comments] = await Promise.all([
  fetchUser(id),
  fetchPosts(id),
  fetchComments(id)
]);

// ✅ Parallel with error handling
const results = await Promise.allSettled([
  fetchUser(id),
  fetchPosts(id),
  fetchComments(id)
]);

const user = results[0].status === 'fulfilled' ? results[0].value : null;
```

### Async Iteration
```javascript
// ✅ Process items in parallel with controlled concurrency
async function processItems(items, concurrency = 3) {
  const results = [];
  
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(item => processItem(item))
    );
    results.push(...batchResults);
  }
  
  return results;
}
```

## 4. React Patterns

### Component Structure
```typescript
// ✅ Functional component with TypeScript
interface UserProfileProps {
  userId: string;
  onUpdate?: (user: User) => void;
}

export function UserProfile({ userId, onUpdate }: UserProfileProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchUser(userId).then(setUser).finally(() => setLoading(false));
  }, [userId]);
  
  if (loading) return <LoadingSpinner />;
  if (!user) return <ErrorMessage />;
  
  return <div>{user.name}</div>;
}
```

### Custom Hooks
```typescript
// ✅ Extract reusable logic into custom hooks
function useUser(userId: string) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    let cancelled = false;
    
    fetchUser(userId)
      .then(data => {
        if (!cancelled) setUser(data);
      })
      .catch(err => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    
    return () => {
      cancelled = true;
    };
  }, [userId]);
  
  return { user, loading, error };
}
```

### Avoid Prop Drilling
```typescript
// ✅ Use Context for deeply nested data
const ThemeContext = React.createContext<'light' | 'dark'>('light');

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  return (
    <ThemeContext.Provider value={theme}>
      <DeepComponent />
    </ThemeContext.Provider>
  );
}

function DeepComponent() {
  const theme = useContext(ThemeContext);
  return <div className={theme}>Content</div>;
}
```

### Memoization
```typescript
// ✅ useMemo for expensive calculations
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(data);
}, [data]);

// ✅ useCallback for function props
const handleClick = useCallback(() => {
  processData(data);
}, [data]);

// ❌ Don't over-optimize
// Only use memo/callback if profiling shows performance issues
```

## 5. Security Considerations

### XSS Prevention
```javascript
// ❌ Dangerous
element.innerHTML = userInput;
eval(userInput);
new Function(userInput)();

// ✅ Safe alternatives
element.textContent = userInput;
element.innerText = userInput;

// ✅ For React, JSX escapes by default
<div>{userInput}</div>

// ❌ Dangerous in React
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// ✅ Sanitize if HTML is required
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />
```

### Authentication Tokens
```javascript
// ❌ Never store sensitive tokens in localStorage
localStorage.setItem('authToken', token);

// ✅ Use httpOnly cookies (backend sets)
// Or sessionStorage with proper security headers

// ✅ For API calls, use secure storage
class ApiClient {
  private token: string | null = null;
  
  setToken(token: string) {
    this.token = token;
    // Store in memory only, or secure cookie
  }
  
  async fetch(url: string) {
    return fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });
  }
}
```

### Input Validation
```javascript
// ✅ Validate all inputs
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

// ✅ Use schema validation libraries
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().min(0).max(150)
});

function validateUser(data: unknown) {
  return UserSchema.parse(data);
}
```

## 6. Performance Optimization

### Debouncing and Throttling
```javascript
// ✅ Debounce for search inputs
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

const handleSearch = debounce((query: string) => {
  performSearch(query);
}, 300);

// ✅ Throttle for scroll events
function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

const handleScroll = throttle(() => {
  updateScrollPosition();
}, 100);
```

### Lazy Loading
```javascript
// ✅ Code splitting
const AdminPanel = React.lazy(() => import('./AdminPanel'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <AdminPanel />
    </Suspense>
  );
}

// ✅ Dynamic imports
async function loadModule() {
  const module = await import('./heavy-module');
  return module.default;
}
```

## 7. Common Pitfalls

### Stale Closures
```javascript
// ❌ Common mistake with useEffect
function Counter() {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCount(count + 1); // Stale closure! Always uses initial count
    }, 1000);
    return () => clearInterval(interval);
  }, []); // Missing dependency
  
  return <div>{count}</div>;
}

// ✅ Solution 1: Include dependency
useEffect(() => {
  const interval = setInterval(() => {
    setCount(count + 1);
  }, 1000);
  return () => clearInterval(interval);
}, [count]);

// ✅ Solution 2: Use updater function
useEffect(() => {
  const interval = setInterval(() => {
    setCount(prevCount => prevCount + 1);
  }, 1000);
  return () => clearInterval(interval);
}, []);
```

### Array Methods Return Values
```javascript
// ❌ Wrong - forEach returns undefined
const doubled = [1, 2, 3].forEach(x => x * 2);

// ✅ Use map for transformations
const doubled = [1, 2, 3].map(x => x * 2);

// ✅ Use filter for filtering
const evens = [1, 2, 3, 4].filter(x => x % 2 === 0);

// ✅ Use reduce for aggregation
const sum = [1, 2, 3].reduce((acc, x) => acc + x, 0);
```

### Comparing Objects
```javascript
// ❌ Wrong - compares references
{} === {} // false
[1, 2] === [1, 2] // false

// ✅ Deep equality check
import _ from 'lodash';
_.isEqual(obj1, obj2);

// ✅ For React, use JSON.stringify for simple cases
JSON.stringify(obj1) === JSON.stringify(obj2);
```

## Review Checklist

When reviewing JavaScript/TypeScript code, check for:

- [ ] Uses const/let instead of var
- [ ] TypeScript types are specific (no excessive 'any')
- [ ] Async operations have error handling
- [ ] No unhandled promise rejections
- [ ] XSS prevention measures in place
- [ ] Input validation for user data
- [ ] No sensitive data in localStorage
- [ ] Proper dependency arrays in useEffect
- [ ] Memoization used appropriately
- [ ] Event handlers cleaned up properly
- [ ] No hardcoded secrets or API keys
- [ ] Code splitting for large bundles
