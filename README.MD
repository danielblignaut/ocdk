1. Deploy this stack set
2. Manually create the SSL cert for cognito custom domain in us-east-1 zone (cant deploy cloudfront resources across multi zones without using stacksets)
3. in each env cognito distribution add the custom domain
4. add the A record for the cloudfront dist to the hosted zones in the route 53 setup
5. request increase in SNS limit for SMS's from cognito
6. verify domain ownership in amazon ses
7. populate secrets manager secrets

# TOOLS

* AWS CDK
* Stripe CLI (brew install stripe/stripe-cli/stripe)

# Cognito Custom Attributes

The following Cognito Attributes are in use
address
email
phone_number
first_name
given_name
twilioAccessToken

The following attributes are deprecated:
stripeCustomerId
stripeSubscriptions
stripePaymentMethods
stripeMainMethodId
signUpAppSource
profilePicture
shopifyCustomerId

# TODOs

any secrets fetched from secrets manager, type should be optional and add null checks
udpate the postConfirmation craete twilio channel to only create channels for customers
update custom attributes on preauth lambda trigger to be prefixed with custom:
fix cognito 5 second trigger on lambdas by making use of step functions
twilio fix not all webhooks firing - perhaps they only fire when query comes from client API, not from server API?# ocdk
