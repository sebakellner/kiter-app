import { RouterProvider } from 'react-router-dom'
import { LibrarySessionProvider } from './features/library/components/LibrarySessionProvider'
import { SamplesViewStateProvider } from './views/Samples/SamplesViewStateProvider'
import { router } from './routes/router'

export default function App(): React.JSX.Element {
  return (
    <LibrarySessionProvider>
      <SamplesViewStateProvider>
        <RouterProvider router={router} />
      </SamplesViewStateProvider>
    </LibrarySessionProvider>
  )
}
