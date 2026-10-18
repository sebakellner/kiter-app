import { RouterProvider } from 'react-router-dom'
import { LibrarySessionProvider } from './features/library/components/LibrarySessionProvider'
import { router } from './routes/router'

export default function App(): React.JSX.Element {
  return (
    <LibrarySessionProvider>
      <RouterProvider router={router} />
    </LibrarySessionProvider>
  )
}
