import { isValidObjectId, Types } from 'mongoose'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcrypt'
import chalk from 'chalk'

import { IUser, MCalendar, MUser } from './database'
import { Calendar } from './Calendar'

/**
 * A class that represents a user, provides all attributes of a user and all modification functions.
 * Allows not to use directly the database.
 */
export class User {
	initialized = false
	// From constructor
	id: Types.ObjectId
	weekStartsMonday: boolean
	// From database / init
	username: IUser['username'] | undefined
	api_keys: IUser['api_keys'] | undefined
	notifications: IUser['notifications'] | undefined

	/**
	 * The constructor take only the user id.
	 * The next mandatory thing to do is to call the init() function or the dbInit() function,
	 * otherwise all attributes and methods will be inaccessible.
	 *
	 * @param {string | Types.ObjectId} id - The user id
	 */
	public constructor (id: string | Types.ObjectId) {
		this.id = new Types.ObjectId(id)
		this.weekStartsMonday = true
	}

	/**
	 * Retrieve all user information from the database
	 *
	 * @returns {Promise} A promise that resolve when the user is initialized
	 */
	dbInit(): Promise<void> {
		return new Promise((resolve, reject) => {
			getUserById(this.id).then((user) => {
				this.username = user.username
				this.api_keys = user.api_keys
				this.notifications = user.notifications

				this.initialized = true
				resolve()
			}).catch((err) => {
				reject(err)
			})
		})
	}

	/**
	 * Sets all attributes of the user as given, then passes the user to initialized.
	 *
	 * @param {IUser} user - The "source" user, which is returned by the database.
	 */
	init(user: IUser): void {
		this.username = user.username
		this.api_keys = user.api_keys
		this.notifications = user.notifications

		this.initialized = true
	}

	//#region CALENDARS

	/**
	 * Find every calendars of the user
	 *
	 * @returns {Promise<Calendar[]>} - A promise that resolve(IUser[]) or reject(errorMessage)
	 */
	getCalendars()
			: Promise<Calendar[]> {
		if (!this.initialized) {
			console.error(chalk.red('The user has not been initialized.'))
			process.exit(1)
		}

		return new Promise((resolve, reject) => {
			MCalendar.find({user_id: this.id}, null, (err, db_calendars) => {
				if (err) return reject({code: 500, message: err.message})

				const calendars: Calendar[] = []
				db_calendars.forEach(db_calendar => {
					const calendar = new Calendar(db_calendar._id)
					calendar.init(db_calendar)
					calendars.push(calendar)
				})
				return resolve(calendars)
			})
		})
	}

	/**
	 * Find a calendar of the user with the given id
	 *
	 * @param {string} id - The calendar's id
	 * @returns {Promise<Calendar>} - A promise that resolve(ICalendar) or reject(errorMessage)
	 */
	getCalendarById(id: string)
			: Promise<Calendar> {
		if (!this.initialized) {
			console.error(chalk.red('The user has not been initialized.'))
			process.exit(1)
		}

		return new Promise((resolve, reject) => {
			MCalendar.findById(id, null, (err, db_calendar) => {
				if (err)
					return reject({code: 500, message: err.message})
				if (!db_calendar)
					return reject({code: 404, message: 'Calendar doesn\'t exists'})
				if (db_calendar.user_id.toString() != this.id.toString())
					return reject({code: 403, message: 'You don\'t own this calendar'})

				const calendar: Calendar = new Calendar(db_calendar._id)
				calendar.init(db_calendar)
				return resolve(calendar)
			})
		})
	}

	/**
	 * Add a calendar for the user
	 *
	 * @param {string} name - The name of the future calendar
	 * @returns {Promise<Calendar>} - A promise that resolve(ICalendar) or reject(errorMessage)
	 */
	addCalendar(name: string)
			: Promise<Calendar> {
		if (!this.initialized) {
			console.error(chalk.red('The user has not been initialized.'))
			process.exit(1)
		}

		return new Promise((resolve, reject) => {
			getUserById(this.id).then(user => {
				new MCalendar({
					name,
					user_id: user.id,
					agenda: [1, 1, 1, 1, 1, 1, 1],
					days: {},
					notifications: {reminders: true, congrats: true}
				}).save((err, data) => {
					if (err) return reject({code: 500, message: err.message})

					const calendar = new Calendar(data._id)
					calendar.init(data)
					resolve(calendar)
				})
			}).catch(err => {
				reject(err)
			})
		})
	}

	//#endregion CALENDARS

	//#region API

	/**
	 * Create an API with the given name for the user and returns it
	 * Api keys have the following format: user_id.key_id.key
	 *
	 * @param {string} name - The name of the api key
	 * @returns {Promise<string>} - A promise that resolve(string) or reject(errorMessage)
	 */
	createApiKey(name: string)
			: Promise<string> {
		if (!this.initialized) {
			console.error(chalk.red('The user has not been initialized.'))
			process.exit(1)
		}

		return new Promise((resolve, reject) => {
			if (name.length == 0)
				return reject({code: 400, message: 'Name can\'t be empty'})

			const key = uuidv4().replaceAll('-', '')
			const key_id = new Types.ObjectId()

			bcrypt.hash(key, 10, (err, key_hash) => {
				if (err) return reject(err)

				MUser.findByIdAndUpdate(
					this.id,
					{ $push: { api_keys: { _id: key_id, name, key_hash }} },
					(err, result) => {
						if (err)
							return reject({code: 500, message: err.message})
						if (!result)
							return reject({code: 404, message: 'User doesn\'t exists'})

						resolve(`${this.id}.${key_id}.${key}`)
					})
			})
		})
	}

	/**
	 * Check that the given api key exist and id valid for the user
	 *
	 * @param {string} api_key - The api key to check
	 * @returns {Promise} - A promise that resolve() or reject(errorMessage)
	 */
	checkApiKey(api_key: string)
			: Promise<void> {
		if (!this.initialized) {
			console.error(chalk.red('The user has not been initialized.'))
			process.exit(1)
		}

		return new Promise((resolve, reject) => {
			if (api_key.split('.').length != 3)
				return reject({code: 400, message: 'Bad api key format'})

			const key_id = api_key.split('.')[1]
			const key = api_key.split('.')[2]

			if (!isValidObjectId(key_id))
				return reject({code: 400, message: 'Bad api key format'})

			MUser.findById(this.id, null, (err, user) => {
				if (err) return reject({code: 500, message: err.message})
				if (!user) return reject({code: 404, message: 'User doesn\'t exists'})

				let key_hash = ''

				if(user.api_keys) {
					user.api_keys.every(key => {
						if (key._id.toString() == key_id) {
							key_hash = key.key_hash
							return false
						}
						return true
					})
				}

				if (key_hash == '')
					return reject({code: 404, message: 'Api key doesn\'t exists'})

				bcrypt.compare(key, key_hash, (err, result) => {
					if (err) return reject({code: 500, message: err.message})

					if (result)
						resolve()
					else
						return reject({code: 403, message: 'Bad api key'})
				})
			})
		})
	}

	//#endregion API
}


/**
 * Add the specified user to the database. The password is stored hashed
 *
 * @param {string} username - The users's username
 * @param {string} password - The users's password
 * @returns {Promise<User>} - A promise that resolve(IUser)
 */
export function addUser(username: string, password: string)
		: Promise<User> {
	return new Promise((resolve, reject) => {
		if (!/^[a-z0-9_.]+$/.exec(username))
			return reject('The username contains unauthorized characters. Authorized characters: a-z, 0-9, ., _')
		if (password.length == 0)
			return reject('Password can\'t be empty')
		bcrypt.hash(password, 10, (err, hash) => {
			if (err) return reject(err)

			new MUser({
				username,
				password_hash: hash
			}).save((err, data) => {
				if (err) return reject(err)

				const user = new User(data._id)
				user.init(data)
				resolve(user)
			})
		})
	})
}

/**
 * Compare the hashed password of the given username with the given password
 *
 * @param {string} username - The users's username
 * @param {string} password - The users's password to test
 * @returns {Promise<User>} - A promise that resolve(IUser) if passwords match or reject(errorMessage)
 */
export function checkPassword(username: string, password: string)
		: Promise<User> {
	return new Promise((resolve, reject) => {
		MUser.findOne({ username }, null, (err, db_user) => {
			if (err) return reject(err)
			if (!db_user) return reject('User doesn\'t exists')

			bcrypt.compare(password, db_user.password_hash, (err, result) => {
				if (err) return reject(err)

				if (result) {
					const user = new User(db_user._id)
					user.init(db_user)
					resolve(user)
				}
				else
					reject('Wrong password')
			})
		})
	})
}

/**
 * Find a user in database with the given id
 *
 * @param {string} id - The users's id
 * @returns {Promise<User>} - A promise that resolve(IUser) or reject(errorMessage)
 */
export function getUserById(id: string | Types.ObjectId)
		: Promise<User> {
	return new Promise((resolve, reject) => {
		MUser.findById(id, null, (err, db_user) => {
			if (err) return reject({code: 500, message: err.message})
			if (!db_user) return reject({code: 404, message: 'User doesn\'t exists'})

			const user = new User(db_user._id)
			user.init(db_user)
			return resolve(user)
		})
	})
}

/**
 * Find every users of the instance
 *
 * @returns {Promise<User[]>} - A promise that resolve(IUser[]) or reject(errorMessage)
 */
export function getUsers()
		: Promise<User[]> {
	return new Promise((resolve, reject) => {
		MUser.find({}, null, (err, db_users) => {
			if (err) return reject({code: 500, message: err.message})

			const users: User[] = []
			db_users.forEach(db_user => {
				const user = new User(db_user._id)
				user.init(db_user)
				users.push(user)
			})
			return resolve(users)
		})
	})
}
