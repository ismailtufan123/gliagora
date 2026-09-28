import type { CollectionConfig } from 'payload'

import { Candidates } from './Candidates'
import { Countries } from './Countries'
import { CountrySets } from './CountrySets'
import { FormLimits } from './FormLimits'
import { Institutions } from './Institutions'
import { Jobs } from './Jobs'
import { Reports } from './Reports'
import { RetiredListings } from './RetiredListings'
import { Submissions } from './Submissions'
import { Terms } from './Terms'
import { Users } from './Users'

// Every collection of payload.config.ts, in the order of the admin menu: the daily work first
// (PLAN §6.5). FormLimits is hidden.
export const COLLECTIONS: CollectionConfig[] = [
  Users,
  Candidates,
  Submissions,
  Reports,
  Jobs,
  RetiredListings,
  Terms,
  Countries,
  CountrySets,
  Institutions,
  FormLimits,
]
