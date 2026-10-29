import { createHashRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@renderer/layouts/AppLayout/AppLayout'
import { Authors } from '@renderer/views/Authors/Authors'
import { ClassificationReview } from '@renderer/views/ClassificationReview/ClassificationReview'
import { Instruments } from '@renderer/views/Instruments/Instruments'
import { Collections } from '@renderer/views/Collections/Collections'
import { CollectionDetail } from '@renderer/views/CollectionDetail/CollectionDetail'
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
      { path: 'collections/:id', element: <CollectionDetail /> },
      { path: 'instruments', element: <Instruments /> },
      { path: 'authors', element: <Authors /> },
      { path: 'classification/review', element: <ClassificationReview /> },
      { path: '*', element: <Navigate to="/home" replace /> },
    ],
  },
])
