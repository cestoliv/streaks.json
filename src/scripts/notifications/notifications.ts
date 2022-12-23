import moment from 'moment'

import { Calendar } from '../database/Calendar'
import { getUsers, User } from '../database/User'
import { hour_between } from '../utils'
import { MatrixNotifications } from './matrix'

export type summary = Array<{ name: string, fail: boolean, streaks: number }>

/**
 * Sends a reminder to all users for all tasks they have not done.
 * It is sent only if the current time is in the slot indicated by the user.
 * Sends only to users who have activated a notification service supported by the instance.
 */
export async function sendReminders() {
	let matrix: MatrixNotifications | undefined

	// Check enabled services and enable them
	if (process.env.MATRIX_ENABLED && process.env.MATRIX_ENABLED == 'true') {
		matrix = new MatrixNotifications()
		await matrix.connect()
	}

	const users = await getUsers()

	const notificationsPromises: Array<Promise<void>> = []

	for (let u = 0; u < users.length; u++) {
		if (!users[u].notifications)
			continue

		const calendars = await users[u].getCalendars()
		const sum: summary = []
		let has_fails = false

		for (let c = 0; c < calendars.length; c++) {
			if (!calendars[c].notifications?.reminders)
				continue
			if (calendars[c].days?.get(moment().format('YYYY-MM-DD')) &&
				calendars[c].days?.get(moment().format('YYYY-MM-DD')) != 'fail')
				sum.push({name: calendars[c]?.name ?? '', fail: false, streaks: calendars[c].countStreaks()})
			else {
				sum.push({name: calendars[c]?.name ?? '', fail: true, streaks: calendars[c].countStreaks()})
				has_fails = true
			}
		}

		if (has_fails) {
			if (matrix && (users[u].notifications?.matrix.room_id ?? false))
				if (hour_between((users[u].notifications?.matrix.start_date ?? '00:00'), (users[u].notifications?.matrix.end_date ?? '24:00')))
					notificationsPromises.push(matrix.sendReminder((users[u].notifications?.matrix.room_id ?? ''), sum))

			if (users[u].notifications?.streaks_done.sent_today)
				await users[u].setStreaksDoneSentToday(false)
		}
		else if (users[u].notifications?.streaks_done.enabled
			&& users[u].notifications?.streaks_done.channel != ''
			&& !users[u].notifications?.streaks_done.sent_today) {

			if (matrix
				&& users[u].notifications?.streaks_done.channel == 'matrix'
				&& (users[u].notifications?.matrix.room_id ?? false))
				notificationsPromises.push(matrix.sendStreaksDone(users[u].notifications?.matrix.room_id ?? ''))

			await users[u].setStreaksDoneSentToday(true)
		}
	}

	await Promise.allSettled(notificationsPromises).then(async () => {
		if (matrix)
			matrix.disconnect()
	})
}

/**
 * Sends a congratulatory message to the user given in parameter, for the calendar passed in parameter.
 * It is sent only if the current time is in the slot indicated by the user.
 * Sends only to users who have activated a notification service supported by the instance.
 *
 * @param {User} user - The user to send the message to
 * @param {Calendar} calendar - The calendar involved
 */
export async function sendCongratulation(user: User, calendar: Calendar) {
	let matrix: MatrixNotifications | undefined

	// Check enabled services and enable them
	if (process.env.MATRIX_ENABLED && process.env.MATRIX_ENABLED == 'true') {
		matrix = new MatrixNotifications()
		await matrix.connect()
	}

	const notificationsPromises: Array<Promise<void>> = []

	if (calendar.days?.get(moment().format('YYYY-MM-DD')) &&
		calendar.days?.get(moment().format('YYYY-MM-DD')) != 'success')
		return

	if (matrix && (user.notifications?.matrix.room_id ?? false))
		if (hour_between((user.notifications?.matrix.start_date ?? '00:00'), (user.notifications?.matrix.end_date ?? '24:00')))
			notificationsPromises.push(matrix.sendCongratulation((user.notifications?.matrix.room_id ?? ''), calendar))

	await Promise.allSettled(notificationsPromises).then(async () => {
		if (matrix)
			matrix.disconnect()
	})
}

// export async function sendStreaksEndNotifications() {
// 	let matrix: MatrixNotifications | undefined

// 	// Check enabled services and enable them
// 	if (process.env.MATRIX_ENABLED && process.env.MATRIX_ENABLED == 'true') {
// 		matrix = new MatrixNotifications()
// 		await matrix.connect()
// 	}

// 	const notificationsPromises: Array<Promise<void>> = []

// 	if (matrix && (user.notifications?.matrix.room_id ?? false))
// 		if (hour_between((user.notifications?.matrix.start_date ?? '00:00'), (user.notifications?.matrix.end_date ?? '24:00')))
// 			notificationsPromises.push(matrix.sendStreaksEndNotification((user.notifications?.matrix.room_id ?? '')))

// 	await Promise.allSettled(notificationsPromises).then(async () => {
// 		if (matrix)
// 			matrix.disconnect()
// 	})
// }