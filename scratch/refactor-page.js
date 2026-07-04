const fs = require('fs');
let content = fs.readFileSync('apps/web/src/app/dashboard/users/page.tsx', 'utf-8');

// Replace imports
content = content.replace('import { useEffect, useState, FormEvent } from "react";', 'import { useEffect, useState, FormEvent } from "react";\nimport { useAuth } from "@/lib/auth-context";');
content = content.replace('import { AppHeader, LoginScreen } from "@/features/inbox/inbox-components";\n', '');

// Replace state
content = content.replace(/const \[token, setToken\] = useState<string \| null>\(null\);\n  const \[currentUser, setCurrentUser\] = useState<CurrentUser \| null>\(null\);\n  const \[authLoading, setAuthLoading\] = useState\(true\);\n  const \[authError, setAuthError\] = useState<string \| null>\(null\);\n/g, 'const { token, currentUser } = useAuth();');

// Remove auth useEffect
content = content.replace(/useEffect\(\(\) => \{\n    const storedToken = window\.localStorage\.getItem\(TOKEN_STORAGE_KEY\);\n    if \(!storedToken\) \{\n      setAuthLoading\(false\);\n      return;\n    \}\n\n    apiClient\n      \.me\(storedToken\)\n      \.then\(\(user\) => \{\n        setToken\(storedToken\);\n        setCurrentUser\(user\);\n      \}\)\n      \.catch\(\(\) => \{\n        window\.localStorage\.removeItem\(TOKEN_STORAGE_KEY\);\n        setToken\(null\);\n      \}\)\n      \.finally\(\(\) => setAuthLoading\(false\)\);\n  \}, \[\]\);\n\n/g, '');

// Remove handleLogin
content = content.replace(/async function handleLogin[\s\S]*?\}\n  \}\n\n/g, '');

// Remove handleLogout
content = content.replace(/function handleLogout\(\) \{[\s\S]*?setCurrentUser\(null\);\n  \}\n\n/g, '');

// Remove authLoading and !token checks
content = content.replace(/if \(authLoading\) \{\n    return \(\n      <main className=\"flex min-h-screen items-center justify-center bg-\[\#F8F9FB\]\">\n        <div className=\"h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-\[\#EE0033\]\"><\/div>\n      <\/main>\n    \);\n  \}\n\n  if \(!token \|\| !currentUser\) \{\n    return <LoginScreen error=\{authError\} onLogin=\{handleLogin\} \/>;\n  \}\n\n/g, 'if (!currentUser) return null;\n\n');

// Replace return wrappers for Access Denied
content = content.replace(/<main className="h-screen w-full overflow-hidden bg-\[\#F8F9FB\] p-2 sm:p-4 text-slate-800 font-sans">\n        <div className="flex h-full flex-col gap-4">\n          <div className="shrink-0 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">\n            <AppHeader apiBaseUrl=\{API_BASE_URL\} currentUser=\{currentUser\} onLogout=\{handleLogout\} \/>\n          <\/div>\n          <div className="flex flex-1 items-center justify-center p-8 min-h-0 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">\n            <div className="rounded-2xl bg-white p-8 text-center max-w-md">\n              <AlertCircle className="mx-auto h-12 w-12 text-\[\#EE0033\] mb-4" \/>\n              <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied<\/h2>\n              <p className="text-slate-500 mb-6">You need Administrator privileges to manage users\.<\/p>\n              <Link href="\/" className="inline-flex h-11 items-center justify-center rounded-xl bg-\[\#EE0033\] px-6 text-sm font-semibold text-white transition-all hover:bg-\[\#c4002a\] shadow-md shadow-\[\#EE0033\]\/20">\n                Return to Inbox\n              <\/Link>\n            <\/div>\n          <\/div>\n        <\/div>\n      <\/main>/g, '<div className="flex flex-1 items-center justify-center p-8 min-h-0 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">\n        <div className="rounded-2xl bg-white p-8 text-center max-w-md border border-slate-200 shadow-sm">\n          <AlertCircle className="mx-auto h-12 w-12 text-[#EE0033] mb-4" />\n          <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>\n          <p className="text-slate-500 mb-6">You need Administrator privileges to manage users.</p>\n          <Link href="/" className="inline-flex h-11 items-center justify-center rounded-xl bg-[#EE0033] px-6 text-sm font-semibold text-white transition-all hover:bg-[#c4002a] shadow-md shadow-[#EE0033]/20">\n            Return to Inbox\n          </Link>\n        </div>\n      </div>');

// Replace return wrapper for main content
content = content.replace(/return \(\n    <main className="h-screen w-full overflow-hidden bg-\[\#F8F9FB\] p-2 sm:p-4 text-slate-800 font-sans">\n      <div className="flex h-full flex-col gap-4">\n        <div className="shrink-0 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">\n          <AppHeader apiBaseUrl=\{API_BASE_URL\} currentUser=\{currentUser\} onLogout=\{handleLogout\} \/>\n        <\/div>\n\n        <div className="flex-1 overflow-y-auto min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm p-4 sm:p-6 lg:p-8 flex flex-col">/g, 'return (\n    <div className="flex-1 overflow-y-auto min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm p-4 sm:p-6 lg:p-8 flex flex-col">');

// Replace closing tags
content = content.replace(/<\/div>\n      <\/div>\n    <\/main>\n  \);\n\}/g, '</div>\n  );\n}');

fs.writeFileSync('apps/web/src/app/dashboard/users/page.tsx', content);
console.log('Done');
