import type { CollectionConfig } from 'payload'

import { Candidates } from './Candidates'
import { ConsentLog } from './ConsentLog'
import { Countries } from './Countries'
import { CountrySets } from './CountrySets'
import { DataRequests } from './DataRequests'
import { DeletionLog } from './DeletionLog'
import { FormLimits } from './FormLimits'
import { Institutions } from './Institutions'
import { Jobs } from './Jobs'
import { EmailTokens } from './members/EmailTokens'
import { MemberSessions } from './members/MemberSessions'
import { Members } from './members/Members'
import { SavedItems } from './members/SavedItems'
import { Reports } from './Reports'
import { RetiredListings } from './RetiredListings'
import { Submissions } from './Submissions'
import { Terms } from './Terms'
import { Users } from './Users'

// Every collection of payload.config.ts, in the order of the admin menu: the daily work first
// (PLAN §6.5). FormLimits, the member collections and the deletion log are hidden (M4b, D49), and
// so is the consent log of Glia Notes (M2, D50).
export const COLLECTIONS: CollectionConfig[] = [
  Users,
  Candidates,
  Submissions,
  Reports,
  DataRequests,
  Jobs,
  RetiredListings,
  Terms,
  Countries,
  CountrySets,
  Institutions,
  FormLimits,
  Members,
  MemberSessions,
  EmailTokens,
  SavedItems,
  DeletionLog,
  ConsentLog,
]
