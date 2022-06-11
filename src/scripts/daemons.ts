import { getCalendars, getUsers, User } from './database'
import { countStreaks, dateString } from './utils'
import chalk from 'chalk'
import moment from 'moment'
import dotenv from 'dotenv'

import { MatrixNotifications } from './notifications/matrix'

dotenv.config()

/**
 * Go through the calendar and set the breakday status to the current day
 * if it is a breakday (a 0 in agenda)
 * @return - A promise that resolve(void) at the end
 */
function setBreakdays(): Promise<void> {
	return new Promise((resolve, _reject) => {
		getCalendars().then((db_calendars) => {
			var promisesList: Array<Promise<void>> = Array()

			db_calendars.forEach((db_calendar) => {
				promisesList.push(new Promise((resolve, _reject) => {
					var user = new User(db_calendar.user_id.toString())
					var weekday: number = new Date().getDay()

					if (!db_calendar.agenda[weekday]) {
						if (db_calendar.days.get(dateString(new Date())) != "success") {
							user.setDayState(db_calendar._id, dateString(new Date()), "breakday").catch((err) => {
								console.error(`Daemons: ${chalk.red(err.message)}`)
							}).finally(() => {
								resolve()
							})
						}
						else
							resolve()
					}
					else
						resolve()
				}))
			})
			Promise.allSettled(promisesList).then(() => {
				resolve()
			})
		}).catch((err) => {
			console.error(`Daemons: ${chalk.red(err.message)}`)
			resolve()
		})
	})
}

export async function sendNotifications() {
	var matrix: MatrixNotifications | undefined

	// Check enabled services and enable them
	if (process.env.MATRIX_ENABLED && process.env.MATRIX_ENABLED == "true") {
		matrix = new MatrixNotifications()
		await matrix.connect()
	}

	const users = await getUsers()

	var notificationsPromises: Array<Promise<void>> = Array()

	for (let u = 0; u < users.length; u++) {
		const user = new User(users[u]._id)
		const calendars = await user.getCalendars()

		for (let c = 0; c < calendars.length; c++) {
			let message = ''

			if (calendars[c].days.get(moment().format('YYYY-MM-DD')) == undefined
				|| calendars[c].days.get(moment().format('YYYY-MM-DD')) == 'fail')
				message = `🔴 You have not completed the '${calendars[c].name}' task!  🔥 ${countStreaks(calendars[c])}`

			if (message == '')
				continue;

			if (matrix && users[u].notifications.matrix.room_id)
				notificationsPromises.push(matrix.sendMessage(users[u].notifications.matrix.room_id, message))
		}
	}

	await Promise.allSettled(notificationsPromises).then(async results => {
		if (matrix)
			matrix.disconnect()
	})
}

/**
 * Run the setBreakday function
 * @returns - A promise that resolve(void) at the end
 */
export function runDaemons(): Promise<void> {
	return new Promise((resolve, _reject) => {
		setBreakdays().then(() => {
			sendNotifications().then(() => {
				resolve()
			})
		})
	})
}
