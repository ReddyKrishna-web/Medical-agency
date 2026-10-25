import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { MailCheck, Send } from 'lucide-react';
import { apiSend } from '@/lib/api';
import { AuthHeading, AuthSuccess } from './AuthHeading';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Form';
import { InlineError } from '@/components/ui/States';
import { SEO } from '@/components/ui/SEO';
const schema=z.object({email:z.string().email('Enter a valid email address')});type Values=z.infer<typeof schema>;
export default function ForgotPasswordPage(){const[done,setDone]=useState(false);const[error,setError]=useState('');const{register,handleSubmit,formState:{errors,isSubmitting}}=useForm<Values>({resolver:zodResolver(schema)});const submit=async(values:Values)=>{setError('');try{await apiSend('post','/auth/forgot-password',values);setDone(true)}catch(err){setError(err instanceof Error?err.message:'Unable to process this request.')}};if(done)return <><SEO title="Check your email" description="Password reset instructions requested." noIndex/><AuthSuccess icon={<MailCheck className="h-7 w-7"/>} title="Check your email" message="If an account matches that address, the service has sent reset instructions. You can close this window if no message arrives." action={<Link to="/login" className="font-medium text-brand-700">Return to sign in</Link>}/></>;return <><SEO title="Forgot password" description="Request Supply Medicals account reset instructions." noIndex/><AuthHeading eyebrow="Account recovery" title="Forgot your password?" description="Enter your account email. The service will send reset instructions if the account exists."/><form onSubmit={handleSubmit(submit)} noValidate className="space-y-5"><Field id="email" label="Email address" error={errors.email?.message} required><TextInput id="email" type="email" autoComplete="email" autoFocus {...register('email')}/></Field><InlineError message={error}/><Button type="submit" className="w-full" size="lg" loading={isSubmitting}><Send className="h-4 w-4"/> Send reset instructions</Button></form><p className="mt-7 text-center text-sm"><Link to="/login" className="font-medium text-brand-700">Back to sign in</Link></p></>}
