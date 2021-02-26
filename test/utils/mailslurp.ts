import MailSlurp from 'mailslurp-client'

export const mailslurp = new MailSlurp({ apiKey: process.env.MAILSLURP_API_KEY })

export const getEmailInboxId = (): string=> {
	switch(process.env.STAGE) {
		case 'SANDBOX': {
			return '465906d6-54c7-4c05-a886-5af30fe1a529'
		}
	}
}

export const waitForNewEmailFromNow = async (now: Date)=> {
	const emails = await mailslurp.emailController.getEmailsPaginated([getEmailInboxId()], null,null,'DESC' )

	if(emails.empty) {
		await new Promise<void>((resolve)=> {
			setTimeout(()=> {
				resolve()
			}, 200)
		})

		return await waitForNewEmailFromNow(now)
	}

	const emailDate = new Date(emails.content[0].createdAt as unknown as string)

	if(emailDate.getTime() < now.getTime()) {
		await new Promise<void>((resolve)=> {
			setTimeout(()=> {
				resolve()
			}, 200)
		})

		return await waitForNewEmailFromNow(now)
	}
	else {
		return Promise.resolve(emails.content[0])
	}
}