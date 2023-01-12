export default {
	props: {
		startingType: {
			// login, register
			type: String,
			required: true,
		},
	},
	data() {
		return {
			type: this.startingType,
			loading: false,
			errors: [],
			username: '',
			password: '',
			passwordRepeat: '',
		};
	},
	created() {
		window.onpopstate = (event) => {
			if (event.state) {
				this.type = event.state.type;
			}
		};
	},
	methods: {
		changeType(type) {
			if (this.loading) return;

			this.type = type;
			if (type === 'login') {
				window.history.pushState({ type: 'login' }, '', '/login');
			} else if (type === 'register') {
				window.history.pushState({ type: 'register' }, '', '/register');
			}
		},
		isSubmitAuthorized() {
			if (this.username.length == 0)
				this.errors.push("Username can't be empty");
			if (this.password.length == 0)
				this.errors.push("Password can't be empty");

			if (this.type === 'login') {
				return this.username.length > 0 && this.password.length > 0;
			} else if (this.type === 'register') {
				if (this.passwordRepeat.length == 0)
					this.errors.push("Password repeat can't be empty");
				else if (this.password !== this.passwordRepeat)
					this.errors.push("Passwords don't match");

				return (
					this.username.length > 0 &&
					this.password.length > 0 &&
					this.passwordRepeat.length > 0 &&
					this.password == this.passwordRepeat
				);
			}
			return false;
		},
		async login() {
			this.errors = [];
			if (!this.isSubmitAuthorized()) return;

			this.loading = true;

			let res = await fetch('/login', {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					username: this.username,
					password: this.password,
				}),
			});

			if (res.ok) {
				window.location.href = '/dashboard';
			} else if (res.status === 404 || res.status === 401) {
				this.errors.push('Wrong username or password');
			} else {
				this.errors.push('An error occured');
			}
			this.loading = false;
		},
		async register() {
			this.errors = [];
			if (!this.isSubmitAuthorized()) return;

			this.loading = true;

			const res = await fetch('/register', {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					username: this.username,
					password: this.password,
					passwordRepeat: this.passwordRepeat,
				}),
			});

			const data = await res.json();
			if (res.ok) {
				window.location.href = '/dashboard';
			} else if (res.status === 409) {
				this.errors.push('Username already taken');
			} else if (data.hasOwnProperty('message')) {
				this.errors.push(data.message);
			} else {
				this.errors.push('An error occured');
			}
			this.loading = false;
		},
	},
	template: `
	<div class="form_box">
		<div class="login" v-show=" type == 'login' ">
			<form @submit.prevent="login">
				<h1>Login</h1>
				<input v-model="username" type="text" placeholder="Username" />
				<input v-model="password" type="password" placeholder="Password" />
				<div class="submit_loading">
					<button type="submit" :disabled="loading">Login</button>
					<svg v-show="loading" class="spinner"><use xlink:href="/public/icons/spinner.svg#icon"></use></svg>
				</div>
				<ul class="errors" v-if="errors.length">
					<li v-for="error in errors">{{ error }}</li>
				</ul>
			</form>
			<p class="change_type">I don't have an account, <a href="/register" @click.prevent="changeType('register')">register</a> !</p>
		</div>
		<div class="register" v-show=" type == 'register' ">
			<form @submit.prevent="register">
				<h1>Register</h1>
				<input v-model="username" type="text" placeholder="Username" />
				<input v-model="password" type="password" placeholder="Password" />
				<input v-model="passwordRepeat" type="password" placeholder="Repeat password" />
				<div class="submit_loading">
					<button type="submit" :disabled="loading">Register</button>
					<svg v-show="loading" class="spinner"><use xlink:href="/public/icons/spinner.svg#icon"></use></svg>
				</div>
				<ul class="errors" v-if="errors.length">
					<li v-for="error in errors">{{ error }}</li>
				</ul>
			</form>
			<p class="change_type">Already have an account ? <a href="/login" @click.prevent="changeType('login')">Login</a> !</p>
		</div>
	</div>
	`,
};