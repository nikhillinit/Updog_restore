/**
 * AddDealModal - Modal for creating new deal opportunities
 *
 * Provides a form to add a new deal to the pipeline with all
 * required and optional fields validated via Zod schema.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';

interface AddDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fundId?: number;
}

// Form validation schema matching API expectations
const formSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(255),
  sector: z.string().min(1, 'Sector is required').max(100),
  stage: z.enum(['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Growth', 'Late Stage']),
  sourceType: z.enum(['Referral', 'Cold outreach', 'Inbound', 'Event', 'Network', 'Other']),
  dealSize: z.string().optional(),
  valuation: z.string().optional(),
  status: z
    .enum(['lead', 'qualified', 'pitch', 'dd', 'committee', 'term_sheet', 'closed', 'passed'])
    .default('lead'),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  foundedYear: z.string().optional(),
  employeeCount: z.string().optional(),
  revenue: z.string().optional(),
  description: z.string().max(5000).optional(),
  website: z.string().url().optional().or(z.literal('')),
  contactName: z.string().max(255).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().max(50).optional(),
  sourceNotes: z.string().max(2000).optional(),
  nextAction: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function AddDealModal({ open, onOpenChange, fundId }: AddDealModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: '',
      sector: '',
      stage: 'Seed',
      sourceType: 'Referral',
      dealSize: '',
      valuation: '',
      status: 'lead',
      priority: 'medium',
      foundedYear: '',
      employeeCount: '',
      revenue: '',
      description: '',
      website: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      sourceNotes: '',
      nextAction: '',
    },
  });

  const createDealMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const payload = {
        ...data,
        fundId,
        dealSize: data.dealSize ? parseFloat(data.dealSize) : undefined,
        valuation: data.valuation ? parseFloat(data.valuation) : undefined,
        foundedYear: data.foundedYear ? parseInt(data.foundedYear, 10) : undefined,
        employeeCount: data.employeeCount ? parseInt(data.employeeCount, 10) : undefined,
        revenue: data.revenue ? parseFloat(data.revenue) : undefined,
      };
      return apiRequest<{ success: boolean; data: unknown }>(
        'POST',
        '/api/deals/opportunities',
        payload
      );
    },
    onSuccess: () => {
      toast({
        title: 'Deal created',
        description: 'The deal has been added to your pipeline.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/deals/opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/deals/pipeline'] });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create deal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: FormValues) => {
    createDealMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-inter text-pov-charcoal">Add New Deal</DialogTitle>
          <DialogDescription className="font-poppins">
            Add a new deal opportunity to your pipeline. Fill in the details below.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Company Information */}
            <div className="space-y-4">
              <h4 className="font-inter font-semibold text-sm text-pov-charcoal border-b border-pov-beige pb-2">
                Company Information
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Company Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Acme Inc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sector"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Sector *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., FinTech" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="stage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Stage *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select stage" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Pre-seed">Pre-seed</SelectItem>
                          <SelectItem value="Seed">Seed</SelectItem>
                          <SelectItem value="Series A">Series A</SelectItem>
                          <SelectItem value="Series B">Series B</SelectItem>
                          <SelectItem value="Series C">Series C</SelectItem>
                          <SelectItem value="Growth">Growth</SelectItem>
                          <SelectItem value="Late Stage">Late Stage</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Website</FormLabel>
                      <FormControl>
                        <Input placeholder="https://example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="foundedYear"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Founded Year</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="2020" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="employeeCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Employee Count</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="25" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-poppins">Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Brief description of the company and opportunity..."
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Deal Details */}
            <div className="space-y-4 pt-2">
              <h4 className="font-inter font-semibold text-sm text-pov-charcoal border-b border-pov-beige pb-2">
                Deal Details
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Status *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="lead">Lead</SelectItem>
                          <SelectItem value="qualified">Qualified</SelectItem>
                          <SelectItem value="pitch">Pitch</SelectItem>
                          <SelectItem value="dd">Due Diligence</SelectItem>
                          <SelectItem value="committee">Committee</SelectItem>
                          <SelectItem value="term_sheet">Term Sheet</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                          <SelectItem value="passed">Passed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Priority *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sourceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Source *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select source" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Referral">Referral</SelectItem>
                          <SelectItem value="Cold outreach">Cold Outreach</SelectItem>
                          <SelectItem value="Inbound">Inbound</SelectItem>
                          <SelectItem value="Event">Event</SelectItem>
                          <SelectItem value="Network">Network</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dealSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Deal Size ($)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="1000000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="valuation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Valuation ($)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="10000000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="revenue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Revenue ($)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="500000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="sourceNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-poppins">Source Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="How did you hear about this deal?"
                        className="min-h-[60px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Contact Information */}
            <div className="space-y-4 pt-2">
              <h4 className="font-inter font-semibold text-sm text-pov-charcoal border-b border-pov-beige pb-2">
                Contact Information
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Contact Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Contact Email</FormLabel>
                      <FormControl>
                        <Input placeholder="john@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Contact Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="+1 (555) 123-4567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nextAction"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-poppins">Next Action</FormLabel>
                      <FormControl>
                        <Input placeholder="Schedule initial call" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-pov-beige"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-pov-charcoal hover:bg-pov-charcoal/90 text-pov-white"
                disabled={createDealMutation.isPending}
              >
                {createDealMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Add Deal'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
