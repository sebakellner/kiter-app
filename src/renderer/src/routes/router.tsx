import { createHashRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@renderer/layouts/AppLayout/AppLayout'
import { Authors } from '@renderer/views/Authors/Authors'
import { Categories } from '@renderer/views/Categories/Categories'
import { Collections } from '@renderer/views/Collections/Collections'
import { Favorites } from '@renderer/views/Favorites/Favorites'
import { Home } from '@renderer/views/Home/Home'
import { Packs } from '@renderer/views/Packs/Packs'
import { Samples } from '@renderer/views/Samples/Samples'

export const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/home" replace /> },
      { path: 'home', element: <Home /> },
      { path: 'samples', element: <Samples /> },
      { path: 'favorites', element: <Favorites /> },
      { path: 'packs', element: <Packs /> },
      { path: 'collections', element: <Collections /> },
      { path: 'categories', element: <Categories /> },
      { path: 'authors', element: <Authors /> },
      { path: '*', element: <Navigate to="/home" replace /> },
    ],
  },
])
