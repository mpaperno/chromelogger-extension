"use strict";
/**
 * Options page scripts.
 * @since 1.5
 */

// message box singleton tracking
var messageTimerId = null;
// the options form
var form = null;


/** Shows a temporary message in the settings form, eg. that the settings were saved. */
function showMessage(message, status = "ok") {
	var msg_el = document.getElementById("message_area");
	msg_el.firstChild?.remove();
	msg_el.appendChild(document.createTextNode(message));
	msg_el.classList.add('visible');
	msg_el.setAttribute('data-status', status);

	if (messageTimerId !== null)
		clearTimeout(messageTimerId);
	messageTimerId = setTimeout(function() {
		messageTimerId = null;
		msg_el.classList.remove('visible');
	}, 5000);
}


/**
 * Populate form from options.
 * @param object opts
 */
function populateForm( opts ) {

	// populate substitution styles ...
	Object.entries(DEFAULT_OPTIONS.console_substitution_styles).forEach(([key, value])=>{
		const input = document.querySelector( 'input#console_substitution_styles-'.concat(key) );
		if ( input ) {
			input.value = opts.console_substitution_styles[key] ?? value;
			input.dispatchEvent(new Event('input')); // trigger change event to update label
		}
	});

	// misc. settings ...
	form.display_data_url.value = opts.display_data_url;
	form.inject_req_headers.checked = opts.inject_req_headers;
	form.use_request_password.checked = opts.use_request_password;
	form.inject_req_headers_for_types.value = opts.inject_req_headers_for_types.join(', ');
	form.fs_header_options.disabled = !opts.inject_req_headers;
	form.backtrace_position.value = opts.backtrace_position.toString();
	form.timestamp_position.value = opts.timestamp_position.toString();

	setPasswordFieldState(!!opts.request_password);
}

function populateFormFromStorage() {
	browser.storage.sync.get(DEFAULT_OPTIONS)
	.then(populateForm)
	.catch(error=>{ console.error(error); });
}

/** Handles formatting the password field on initial load and after saving form. */
function setPasswordFieldState(hasPw) {
	form.request_password.value = "";    // clear the password value, we never actually show it
	form.do_clear_password.value = "";   // remove the "clear" flag in case it's set
	// set an appropriate placeholder text
	form.request_password.placeholder = hasPw ? "A password is currently saved." : "No password is set.";
	// set attributes for visual formatting
	form.request_password.toggleAttribute('data-saved', hasPw);    // has a saved password?
	form.request_password.toggleAttribute('data-changed', false);  // clear the 'changed' indicator
	// toggle the "clear saved password" button accordingly
	document.querySelector("#btn_clear_password").toggleAttribute('hidden', !hasPw);
}

document.addEventListener("DOMContentLoaded", () => {

	form = document.querySelector("form");

	// style inputs ...
	const console_substitution_style_inputs = form.querySelectorAll("fieldset#console_substitution_styles input");

	// update label style on input update ...
	console_substitution_style_inputs.forEach(input=>{
		input.addEventListener("input", event=>{
			event.target.previousElementSibling.querySelector('label').style = event.target.value;
		});
	});

	// populate form from options ...
	populateFormFromStorage();

	// set change handler on "inject headers" option to en/disable the "request types" option accordingly
	form.inject_req_headers.addEventListener("change", () => {
		form.fs_header_options.disabled = !form.inject_req_headers.checked;
	});

	// password field input handler to highlight when a saved password will be changed
	form.request_password.addEventListener("input", (e) => {
		e.target.toggleAttribute('data-changed', e.target.hasAttribute('data-saved') && !!e.target.value);
	})

	// password field "clear" button handler
	document.querySelector("#btn_clear_password").addEventListener("click", (e) => {
		form.request_password.placeholder = "Cleared when options are saved..."
		form.do_clear_password.value = "1";
		form.request_password.toggleAttribute('data-changed', true);
		e.target.toggleAttribute('hidden', true);
	});

	// onsubmit ...
	form.addEventListener("submit", event=>{

		event.preventDefault();

		// reset form to defaults ...
		if ( event.submitter.id == 'reset_defaults' ) {

			populateForm(DEFAULT_OPTIONS);
			showMessage("Default values are shown, but not saved yet.", "warn");
			return;

		}

		// reset form to saved options
		if ( event.submitter.id == 'reset_form' ) {

			populateFormFromStorage();
			showMessage("Form reset to saved option values.");
			return;

		}

		// save ...
		if ( event.submitter.id == 'save' ) {

			// options object to save
			const opts = {
				// styles (populated below) ...
				console_substitution_styles: {},
				// display url log type (''|log|group|groupCollapsed) ...
				display_data_url: form.display_data_url.value,
				// inject request headers, password, and for which request types
				inject_req_headers: form.inject_req_headers.checked,
				use_request_password: form.use_request_password.checked,
				inject_req_headers_for_types: form.inject_req_headers_for_types.value.split(/\s*,\s*/),
				// backtrace and timestamp position values are numeric
				backtrace_position: parseInt(form.backtrace_position.value),
				timestamp_position: parseInt(form.timestamp_position.value),
			};

			// update styles collection ...
			console_substitution_style_inputs.forEach(input => {
				opts.console_substitution_styles[ input.id.substring( input.id.indexOf('-') + 1 ) ] = input.value.trim();
			});

			// add the password value only if it is changing or being cleared; password is stored hashed
			if (!!form.request_password.value)
				opts.request_password = forge_sha256(form.request_password.value);
			else if (!!form.do_clear_password.value)
				opts.request_password = "";

			// save settings ...
			browser.storage.sync.set(opts)
			.then(() => {
				showMessage("Options saved!");
				if (opts.request_password != undefined)
					setPasswordFieldState(!!form.request_password.value);
			})
			.catch(error => {
				console.error(error);
				showMessage("Error: " + error.message, "error");
			});

		}

	});


}, { once: true });
