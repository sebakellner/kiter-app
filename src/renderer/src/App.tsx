import { RouterProvider } from 'react-router-dom'
import { LibrarySessionProvider } from './features/library/components/LibrarySessionProvider'
import { router } from './routes/router'
import { ToastProvider } from './components/ui/Toast'

export default function App(): React.JSX.Element {
  return (
    <ToastProvider>
      <LibrarySessionProvider>
        <RouterProvider router={router} />
      </LibrarySessionProvider>
    </ToastProvider>
  )
}
