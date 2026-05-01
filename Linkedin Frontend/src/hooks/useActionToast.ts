import { useCallback, useMemo } from 'react'
import { useActionToastStore, type ActionToastIcon } from '../store/actionToastStore'

type ShowPayload = {
  icon: ActionToastIcon
  message: string
  linkText?: string
  linkTo?: string
  duration?: number
  dismissible?: boolean
}

export function useActionToast(): {
  show: (payload: ShowPayload) => void
  applied: () => void
  interview: (jobTitle: string) => void
  rejected: (jobTitle: string) => void
  connectionSent: (personName: string) => void
  connectionAccepted: (personName: string) => void
  jobSaved: (jobTitle: string) => void
  messageSent: (personName: string) => void
  applicationSubmitted: (jobTitle: string, companyName: string) => void
  aiTaskComplete: (taskName: string) => void
  profileUpdated: () => void
  jobClosed: (jobTitle: string) => void
} {
  const addToast = useActionToastStore((s) => s.addToast)

  const show = useCallback(
    (payload: ShowPayload) => {
      addToast({
        icon: payload.icon,
        message: payload.message,
        linkText: payload.linkText,
        linkTo: payload.linkTo,
        duration: payload.duration,
        dismissible: payload.dismissible,
      })
    },
    [addToast],
  )

  return useMemo(
    () => ({
      show,
      applied: () => {
        addToast({
          icon: 'applied',
          message: 'Moved to',
          linkText: 'Applied',
          linkTo: '/jobs/tracker',
          duration: 6000,
        })
      },
      interview: (jobTitle: string) => {
        addToast({
          icon: 'interview',
          message: `Moved to Interview stage for ${jobTitle}`,
          linkText: 'Interview',
          linkTo: '/jobs/tracker',
          duration: 6000,
        })
      },
      rejected: (jobTitle: string) => {
        addToast({
          icon: 'rejected',
          message: `Application for ${jobTitle} marked as`,
          linkText: 'Rejected',
          linkTo: '/jobs/tracker',
          duration: 6000,
        })
      },
      connectionSent: (personName: string) => {
        addToast({
          icon: 'connection',
          message: `Connection request sent to ${personName}`,
          duration: 5000,
        })
      },
      connectionAccepted: (personName: string) => {
        addToast({
          icon: 'success',
          message: `You and ${personName} are now connected`,
          linkText: 'View connections',
          linkTo: '/mynetwork',
          duration: 5000,
        })
      },
      jobSaved: (jobTitle: string) => {
        addToast({
          icon: 'saved',
          message: jobTitle,
          linkText: 'saved',
          linkTo: '/jobs/tracker',
          duration: 4000,
        })
      },
      messageSent: (personName: string) => {
        addToast({
          icon: 'message',
          message: `Message sent to ${personName}`,
          linkText: 'View',
          linkTo: '/messaging',
          duration: 4000,
        })
      },
      applicationSubmitted: (jobTitle: string, companyName: string) => {
        addToast({
          icon: 'applied',
          message: `Application submitted for ${jobTitle} at ${companyName}`,
          linkText: 'Track',
          linkTo: '/jobs/tracker',
          duration: 8000,
        })
      },
      aiTaskComplete: (taskName: string) => {
        addToast({
          icon: 'ai',
          message: 'AI task completed:',
          linkText: taskName,
          linkTo: '/recruiter/ai',
          duration: 8000,
        })
      },
      profileUpdated: () => {
        addToast({
          icon: 'success',
          message: 'Profile updated successfully',
          duration: 3000,
        })
      },
      jobClosed: (jobTitle: string) => {
        addToast({
          icon: 'info',
          message: `${jobTitle} has been closed`,
          duration: 5000,
        })
      },
    }),
    [addToast, show],
  )
}
