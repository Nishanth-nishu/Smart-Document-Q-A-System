import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
    title: 'DocKnowledge — Smart Document Q&A',
    description: 'Upload documents and ask AI-powered questions with source citations',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            </head>
            <body className="min-h-screen antialiased">{children}</body>
        </html>
    )
}
